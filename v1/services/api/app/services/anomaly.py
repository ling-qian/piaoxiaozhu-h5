"""账目体检：从已录入的票据里找出「值得看一眼」的记录。

为什么值得做：用户拍票、识别、入库之后，最需要的不再是「再生成一段分析文字」，
而是「这里面有没有问题」。重复报销、金额离群、连号发票，都是真实存在的损耗点，
而且**不需要用户输入任何额外信息**，扫现有数据就能给结论。

设计原则：
- **阈值保守**：宁可漏报，不可误报。误报一次，用户就再也不信这个功能了。
- **给证据**：每条发现都带上支撑数据（哪几张票、金额多少），让用户能自己判断。
- **纯计算**：不调大模型。规则能说清的事不需要花钱，也更快、更稳。
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from typing import Iterable, Optional


@dataclass
class Finding:
    """一条体检发现。severity 决定前端展示的视觉强度。"""

    code: str            # 机器可读类型
    severity: str        # high / medium / low
    title: str           # 一句话结论
    detail: str          # 具体说明（含金额、张数等）
    evidence: list = field(default_factory=list)   # 支撑记录 [{id, invoice_no, amount, date}]

    def to_dict(self) -> dict:
        return asdict(self)


# 样本量下限：低于这个数不做统计判断，避免「两张票就下结论」
MIN_SAMPLES_FOR_OUTLIER = 5
MIN_MONTHS_FOR_TREND = 3

# 金额离群阈值：同时满足「绝对值倍数」和「标准差」才算，收紧误报
OUTLIER_RATIO = 3.0
OUTLIER_SIGMA = 2.5

# 连号判定：同批次连续号码达到这个张数才提示（2 张可能是巧合）
CONSECUTIVE_RUN = 3


def _amount(record) -> float:
    try:
        return float(getattr(record, "amount", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


def _date_str(record) -> str:
    d = getattr(record, "invoice_date", None)
    return str(d)[:10] if d else ""


def _evidence(record) -> dict:
    return {
        "id": str(getattr(record, "id", "")),
        "invoice_no": getattr(record, "invoice_no", None),
        "merchant": getattr(record, "merchant_name", None),
        "amount": round(_amount(record), 2),
        "date": _date_str(record),
    }


def scan(records: Iterable) -> list[Finding]:
    """体检入口。records 需要具备 amount / invoice_no / invoice_date / category_l1 等属性。"""
    records = [r for r in records if r is not None]
    if not records:
        return []

    findings: list[Finding] = []
    findings.extend(_check_duplicate_invoice_no(records))
    findings.extend(_check_amount_outlier(records))
    findings.extend(_check_consecutive_invoice_no(records))
    findings.extend(_check_merchant_spike(records))
    findings.extend(_check_category_mismatch(records))

    # 高危在前，同级按证据数量降序：用户最该先看到的是最贵的那个问题
    severity_rank = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (severity_rank.get(f.severity, 9), -len(f.evidence)))
    return findings


# --------------------------------------------------------------------------- 重复发票号

def _check_duplicate_invoice_no(records) -> list[Finding]:
    """同一发票号码出现多次 = 可能重复报销。

    比"文件哈希去重"更接近业务问题：同一张票换个人再拍一次，哈希不同，号码相同。
    """
    by_no: dict[str, list] = defaultdict(list)
    for r in records:
        no = (getattr(r, "invoice_no", None) or "").strip()
        if len(no) >= 8:      # 太短的当噪声，不参与判定
            by_no[no].append(r)

    out = []
    for no, group in by_no.items():
        if len(group) < 2:
            continue
        total = sum(_amount(r) for r in group)
        out.append(
            Finding(
                code="duplicate_invoice_no",
                severity="high",
                title=f"同一张发票录了 {len(group)} 次",
                detail=f"发票号码 {no} 出现 {len(group)} 次，合计 ¥{total:.2f}。若是同一笔业务，存在重复记账。",
                evidence=[_evidence(r) for r in group[:8]],
            )
        )
    return out


# --------------------------------------------------------------------------- 金额离群

def _check_amount_outlier(records) -> list[Finding]:
    """同分类内金额显著偏离的记录。

    用「中位数 + 倍数 + 标准差」三重条件，避免长尾分布下误报。
    """
    by_cat: dict[str, list] = defaultdict(list)
    for r in records:
        cat = getattr(r, "category_l1", None) or "未分类"
        if _amount(r) > 0:
            by_cat[cat].append(r)

    out = []
    for cat, group in by_cat.items():
        if len(group) < MIN_SAMPLES_FOR_OUTLIER:
            continue
        amounts = [_amount(r) for r in group]
        median = statistics.median(amounts)
        if median <= 0:
            continue
        try:
            stdev = statistics.pstdev(amounts)
        except statistics.StatisticsError:
            stdev = 0.0

        for r in group:
            amt = _amount(r)
            if amt <= median * OUTLIER_RATIO:
                continue
            # 还要超过「均值 + N 倍标准差」，否则样本本身波动大时容易误报
            mean = statistics.fmean(amounts)
            if stdev <= 0 or amt < mean + OUTLIER_SIGMA * stdev:
                continue
            out.append(
                Finding(
                    code="amount_outlier",
                    severity="medium",
                    title=f"「{cat}」里有笔金额明显偏高",
                    detail=(
                        f"该笔 ¥{amt:.2f}，而同类 {len(group)} 笔的中位数只有 ¥{median:.2f}"
                        f"（约 {amt / median:.1f} 倍）。请确认金额是否录错、或是否属于其他分类。"
                    ),
                    evidence=[_evidence(r)],
                )
            )
    return out


# --------------------------------------------------------------------------- 连号发票

def _check_consecutive_invoice_no(records) -> list[Finding]:
    """连续发票号成组出现，提示可能是同一批次集中开票。

    注意：连号本身不代表违规（同一供应商同一天开多张票很常见），
    所以定级为 low，措辞用"集中开票"而不是"异常"。
    """
    groups: dict[str, list] = defaultdict(list)
    for r in records:
        no = (getattr(r, "invoice_no", None) or "").strip()
        code = (getattr(r, "invoice_code", None) or "").strip()
        if no.isdigit() and len(no) >= 8:
            groups[f"{code}|{no[:-4]}"].append((int(no), r))   # 按前段分组，比较后 4 位

    out = []
    for _, items in groups.items():
        if len(items) < CONSECUTIVE_RUN:
            continue
        items.sort(key=lambda x: x[0])
        run = [items[0]]
        for prev, cur in zip(items, items[1:]):
            if cur[0] == prev[0] + 1:
                run.append(cur)
            else:
                run = [cur]
            if len(run) >= CONSECUTIVE_RUN:
                total = sum(_amount(r) for _, r in run)
                out.append(
                    Finding(
                        code="consecutive_invoice_no",
                        severity="low",
                        title=f"{len(run)} 张发票号码连续",
                        detail=(
                            f"号码 {run[0][1].invoice_no} ~ {run[-1][1].invoice_no} 连续，"
                            f"合计 ¥{total:.2f}，像是同一批次集中开具。"
                            "若是同一供应商同一次采购，属正常；否则建议核对。"
                        ),
                        evidence=[_evidence(r) for _, r in run[:8]],
                    )
                )
                break   # 每组只报最长的一段，避免刷屏
    return out


# --------------------------------------------------------------------------- 商户金额突变

def _check_merchant_spike(records) -> list[Finding]:
    """某商户最近一个月支出，显著高于它自己的历史水平。"""
    by_merchant: dict[str, list] = defaultdict(list)
    for r in records:
        name = (getattr(r, "merchant_name", None) or "").strip()
        d = _date_str(r)
        if name and len(d) == 10 and _amount(r) > 0:
            by_merchant[name].append((d[:7], _amount(r)))

    out = []
    for name, rows in by_merchant.items():
        months: dict[str, float] = defaultdict(float)
        for month, amt in rows:
            months[month] += amt
        if len(months) < MIN_MONTHS_FOR_TREND:
            continue

        latest = max(months)
        history = [v for m, v in months.items() if m != latest]
        if len(history) < MIN_MONTHS_FOR_TREND - 1:
            continue
        hist_median = statistics.median(history)
        if hist_median <= 0:
            continue

        current = months[latest]
        if current < hist_median * OUTLIER_RATIO:
            continue

        out.append(
            Finding(
                code="merchant_spike",
                severity="medium",
                title=f"「{name}」本月支出是往常的 {current / hist_median:.1f} 倍",
                detail=(
                    f"{latest} 累计 ¥{current:.2f}，此前月度中位数为 ¥{hist_median:.2f}。"
                    "若确有大批量采购可忽略，否则建议确认是否有票据重复录入。"
                ),
                evidence=[
                    _evidence(r)
                    for r in records
                    if (getattr(r, "merchant_name", None) or "").strip() == name
                    and _date_str(r)[:7] == latest
                ][:8],
            )
        )
    return out


# --------------------------------------------------------------------------- 类目复核

MIN_SAMPLES_FOR_CATEGORY = 3   # 商户至少出现这么多次，才谈得上「主流分类」


def _check_category_mismatch(records) -> list[Finding]:
    """同一商户的分类前后不一致。

    典型场景：同一个「中石化加油站」，这次记成「食材」（因为 OCR 把商品名当成了商户）。
    这类错误会让分类统计整体失真，而且用户自己很难发现。
    """
    by_merchant: dict[str, list] = defaultdict(list)
    for r in records:
        name = (getattr(r, "merchant_name", None) or "").strip()
        cat = (getattr(r, "category_l1", None) or "").strip()
        if name and cat and _amount(r) > 0:
            by_merchant[name].append(r)

    out = []
    for name, group in by_merchant.items():
        if len(group) < MIN_SAMPLES_FOR_CATEGORY:
            continue

        counter: dict[str, int] = defaultdict(int)
        for r in group:
            counter[(r.category_l1 or "").strip()] += 1
        dominant, dom_count = max(counter.items(), key=lambda kv: kv[1])

        # 主流分类要占绝对多数（≥2/3），否则说明这商户本来就跨类目，不该提示
        if dom_count / len(group) < 0.67:
            continue

        odd = [r for r in group if (r.category_l1 or "").strip() != dominant]
        if not odd:
            continue

        out.append(
            Finding(
                code="category_mismatch",
                severity="low",
                title=f"「{name}」的分类前后不一致",
                detail=(
                    f"这个商户的 {dom_count} 笔记为「{dominant}」，但另有 {len(odd)} 笔是"
                    f"「{'、'.join(sorted({(r.category_l1 or '').strip() for r in odd}))}」。"
                    "如果金额对得上，可能只是分类点错了。"
                ),
                evidence=[_evidence(r) for r in odd[:6]],
            )
        )
    return out
