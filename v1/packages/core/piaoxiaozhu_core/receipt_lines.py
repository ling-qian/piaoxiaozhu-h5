"""小票明细行加总 vs 合计的交叉校验。

## 为什么需要

小票没有税额，规则层无法校验「税率关系」；一旦 OCR 把合计读错（19.30 → 193.0，
或少读一位小数），下游全部出错，而且用户自己很难发现。

但小票有一个发票没有的优势：**它有明细行**。把明细金额加起来和合计对一遍，
就能抓出很大一部分 OCR 错误。

## 为什么误报比漏报更糟

用户看到「合计算错了」的提示，第一反应是「这程序不准」。所以判定要保守：
- 至少 2 条明细行才判断（1 条加总等于合计，没有校验意义）
- 出现优惠/折扣字样直接跳过（折后合计本就小于明细之和）
- 容差取 max(0.5 元, 合计的 1%)，覆盖四舍五入与抹零
- 只在偏差明显时报警，不确定就放行
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

# 明细行里不能出现的词：这些行本身不是商品明细
_NON_ITEM_KEYWORDS = (
    "合计", "总计", "小计", "应付", "实付", "实收", "找零", "收款", "付款",
    "优惠", "折扣", "满减", "抹零", "税额", "税率", "余额", "会员", "积分",
    "发票", "税号", "电话", "地址", "单号", "时间", "日期", "收银员", "谢谢",
)

# 出现这些词说明存在折让，明细之和本就会大于合计 → 不做判断
_DISCOUNT_KEYWORDS = ("优惠", "折扣", "满减", "抹零", "减免", "抵用", "券")

# 行尾金额：允许 ¥/￥ 前缀、千分位、负数（退货行）
_AMOUNT_AT_END = re.compile(r"[¥￥]?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|-?\d+\.\d{1,2})\s*$")

# 数量×单价 形态：如 "鸡蛋 2 x 6.40 12.80" / "鸡蛋 2*6.40 12.80"
_QTY_PRICE = re.compile(r"(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)")


@dataclass
class LineCheck:
    ok: bool = True                     # True = 校验通过或不做判断
    checked: bool = False               # 是否真的做了判断（行数够、无折让）
    item_count: int = 0
    items_sum: float = 0.0
    total: Optional[float] = None
    diff: float = 0.0
    message: str = ""                   # 仅在 ok=False 时有值

    def to_dict(self) -> dict:
        return {
            "checked": self.checked,
            "item_count": self.item_count,
            "items_sum": round(self.items_sum, 2),
            "total": self.total,
            "diff": round(self.diff, 2),
            "message": self.message,
        }


def _parse_amount(text: str) -> Optional[float]:
    cleaned = text.replace(",", "").replace("¥", "").replace("￥", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_items(raw_text: str) -> list[float]:
    """从 OCR 文本里抽出明细行的金额。

    规则：取「行尾金额」。小票的明细行几乎都以金额结尾（商品名 … 12.80），
    而中间出现的数字可能是数量或单价，取行尾最稳。
    """
    items: list[float] = []
    for line in (raw_text or "").splitlines():
        text = line.strip()
        if not text or len(text) < 2:
            continue
        if any(k in text for k in _NON_ITEM_KEYWORDS):
            continue

        m = _AMOUNT_AT_END.search(text)
        if not m:
            continue

        amount = _parse_amount(m.group(1))
        if amount is None:
            continue
        # 0 元行没有信息量（赠品、免费项），跳过避免干扰
        if amount == 0:
            continue

        # 形如「鸡蛋 2 x 6.40 12.80」：行尾已是小计金额，直接用；
        # 形如「鸡蛋 2 6.40」两列（数量 单价）时行尾其实是单价，需要乘算。
        head = text[: m.start()]
        qp = _QTY_PRICE.search(head)
        if qp:
            qty, price = float(qp.group(1)), float(qp.group(2))
            # 行尾金额与「数量×单价」明显不一致时，说明行尾才是小计（OCR 常补一列），
            # 保留行尾金额更接近实际记账值。
            if abs(amount - qty * price) <= max(0.02, qty * price * 0.02):
                items.append(round(qty * price, 2))
                continue

        items.append(round(amount, 2))

    return items


def cross_check(raw_text: str, total: Optional[float]) -> LineCheck:
    """明细行加总与合计对账。不确定时返回 ok=True（放行）。"""
    result = LineCheck(total=total)
    if total is None or total <= 0:
        return result

    text = raw_text or ""
    if any(k in text for k in _DISCOUNT_KEYWORDS):
        # 有折让时分母口径不一致，判断没有意义
        return result

    items = extract_items(text)
    result.item_count = len(items)
    result.items_sum = round(sum(items), 2)

    # 少于 2 条明细不做判断。
    # 这不是能力不足，而是刻意取舍：记账用的是「合计」，明细只影响粒度。
    # 若 OCR 漏掉一行，明细之和自然小于合计，但**金额本身仍是对的**，
    # 此时报警只会制造噪音（很多小票还有服务费/打包费未逐行列出）。
    if len(items) < 2:
        return result

    result.checked = True
    diff = abs(result.items_sum - total)
    result.diff = round(diff, 2)

    # 容差：至少 0.5 元，且不超过合计的 1%——小票常有抹零与四舍五入
    tolerance = max(0.5, total * 0.01)
    if diff <= tolerance:
        return result

    # 只在偏差较大时报警（超过 5% 或 5 元），避免因漏识别一行而误报
    if diff <= max(5.0, total * 0.05):
        return result

    result.ok = False
    result.message = (
        f"明细合计 ¥{result.items_sum:,.2f} 与票据合计 ¥{total:,.2f} 相差 ¥{diff:,.2f}，"
        f"可能是某个商品金额没识别对，建议核对"
    )
    return result
