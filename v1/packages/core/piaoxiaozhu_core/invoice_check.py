"""票面结构自检 —— 在本地就能做的「验真」第一层。

必须先把话说清楚：**这里不是税局真伪查验。**

全国增值税发票查验平台（https://inv-veri.chinatax.gov.cn）有图形验证码与频控，
没有公开的免费接口，第三方查验 API 需要付费账号。所以本模块只做两件事：

1. **票面结构自检**：只用票面自身的信息判断这张票是否自洽——号码位数、销方税号位数、
   税额与不含税金额的税率关系、开票日期是否合理。这些检查能抓住 OCR 误识别（把金额
   读错）、录入错行、拼凑假票等明显破绽，但**不能替代税局查验**。
2. **整理官方查验要素**：把查验平台需要的四项（发票代码、发票号码、开票日期、开具金额
   不含税）整理好交给用户，让用户一键跳官方平台完成真伪确认。

刻意**没有**实现「发票代码校验位」算法：检索确认官方规则里发票代码并没有校验位
（10 位代码第 10 位是金额版本号，12 位代码第 9–12 位是发票种类细分码），网上流传的
mod 31 加权算法查无实据、疑似与统一社会信用代码校验混淆。写进去只会制造假阳性。

结果分级（verdict）：
- pass：所有检查通过
- attention：有可疑项，但不构成否定性证据
- suspect：算式或格式明显自相矛盾，需要人工核对
- insufficient：票据身份字段基本没识别出来，无从检查
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Optional

from piaoxiaozhu_core.invoice_identity import is_einvoice_no, normalize_identity

LEVEL_OK = "ok"
LEVEL_WARN = "warn"
LEVEL_FAIL = "fail"

VERDICT_PASS = "pass"
VERDICT_ATTENTION = "attention"
VERDICT_SUSPECT = "suspect"
VERDICT_INSUFFICIENT = "insufficient"

# 官方查验平台的公开入口。仅是一个链接，不需要任何凭据。
OFFICIAL_VERIFY_URL = "https://inv-veri.chinatax.gov.cn"

# 2019 年深化增值税改革后的常见税率，外加此前的不动产 5% 与免税 0%。
# 允许的偏差取 2 分：票面金额由「不含税金额 × 税率」四舍五入而来，
# 分到每一张票上可能有 1 分的舍入差，卡成 0 会产生大量假阳性。
_COMMON_RATES = (0.0, 0.01, 0.03, 0.05, 0.06, 0.09, 0.13)
_TAX_TOLERANCE_CENTS = 2

# 日期合理性的粗界：早于 2000 年基本是 OCR 把「2」认成「1」之类的错读，
# 晚于今天则说明日期字段识别错了。这是一条 sanity bound，不是业务规则。
_MIN_YEAR = 2000

_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


@dataclass(frozen=True)
class Check:
    key: str
    label: str
    level: str
    detail: str


def check_invoice(
    *,
    invoice_type: Optional[str] = None,
    invoice_code: Optional[str] = None,
    invoice_no: Optional[str] = None,
    seller_tax_no: Optional[str] = None,
    invoice_date: Optional[str] = None,
    total_amount_cents: Optional[int] = None,
    tax_amount_cents: Optional[int] = None,
    today: Optional[date] = None,
) -> list[Check]:
    """对一张票据做票面结构自检，返回逐项结果（调用方据此推导 verdict）"""
    checks: list[Check] = []
    einvoice = is_einvoice_no(invoice_no)

    checks.append(_check_invoice_no(invoice_no, einvoice))
    checks.append(_check_invoice_code(invoice_code, einvoice))
    checks.append(_check_tax_no(seller_tax_no))
    checks.append(_check_amounts(total_amount_cents, tax_amount_cents))
    checks.append(_check_date(invoice_date, today or date.today()))

    # 小票/收据判定：没有发票号码、没有发票代码，**且至少识别到一个真实字段**。
    #
    # 第三个条件不能省：什么都不识别到的空白/失败结果同样没有号码，
    # 但它不是小票而是提取失败，必须保持 insufficient（提示用户重拍），
    # 若也降级成 ok 就会得到 pass —— 等于把一次失败包装成「检查通过」。
    has_evidence = total_amount_cents is not None or bool(invoice_date)
    if (
        not normalize_identity(invoice_no)
        and not normalize_identity(invoice_code)
        and has_evidence
    ):
        checks = [_as_receipt(c) for c in checks]

    return checks


# 小票上不适用（或天然缺失）的检查项 → 换成中性说明
_RECEIPT_LABEL_NOTES = {
    "发票号码": "小票/收据通常无发票号，按金额与商户查重",
    "发票代码": "小票/收据通常无发票代码",
    "销售方纳税人识别号": "小票/收据通常不打印税号",
    "金额": "小票通常只有合计金额，无税额可校验",
}


def _as_receipt(check: "Check") -> "Check":
    """把发票专属的 warn 降级为 ok，避免小票被误判为「需关注」。"""
    note = _RECEIPT_LABEL_NOTES.get(check.label)
    if note and check.level == LEVEL_WARN:
        return Check(check.key, check.label, LEVEL_OK, note)
    return check


def derive_verdict(checks: list[Check]) -> str:
    """由逐项检查推导总评。

    注意「没识别出来」与「识别出来但不对」是两回事：全是「未识别到」时，回答
    insufficient 才是诚实的——没有任何一项被正面验证过，不能给用户一个「通过了」
    的错觉。
    """
    if any(c.level == LEVEL_FAIL for c in checks):
        return VERDICT_SUSPECT
    if not any(c.level == LEVEL_OK for c in checks):
        return VERDICT_INSUFFICIENT
    if any(c.level == LEVEL_WARN for c in checks):
        return VERDICT_ATTENTION
    return VERDICT_PASS


def _check_invoice_no(invoice_no: Optional[str], einvoice: bool) -> Check:
    value = normalize_identity(invoice_no)
    if not value:
        # 数电票与老票都可能读不出号码，但两种情况都不影响：只要没号码就没法查重，
        # 属于「信息不足」，交给 derive_verdict 归入 insufficient。
        # 小票/收据本来就没有发票号码，这不是缺陷。措辞按「信息」而非「警告」，
        # 否则每张小票都会带上一条黄色告警，用户会以为程序有问题。
        # 这里保持 warn：本函数不知道这张单是不是小票。
        # 真正的小票由 check_invoice 识别后统一降级（见 _as_receipt），
        # 若在这里无条件返回 ok，会让「什么都没识别到」的空白结果也算通过。
        return Check("invoice_no", "发票号码", LEVEL_WARN, "未识别到发票号码，无法查重与查验")
    if einvoice:
        return Check("invoice_no", "发票号码", LEVEL_OK, "数电票 20 位号码，格式正常")
    if len(value) == 8:
        return Check("invoice_no", "发票号码", LEVEL_OK, "8 位号码，格式正常")
    return Check(
        "invoice_no",
        "发票号码",
        LEVEL_WARN,
        f"号码为 {len(value)} 位，既不是数电票的 20 位也不是传统发票的 8 位，请核对",
    )


def _check_invoice_code(invoice_code: Optional[str], einvoice: bool) -> Check:
    value = normalize_identity(invoice_code)
    if einvoice:
        if value:
            return Check(
                "invoice_code",
                "发票代码",
                LEVEL_WARN,
                "数电票没有发票代码，出现代码说明号码或代码识别有误",
            )
        return Check("invoice_code", "发票代码", LEVEL_OK, "数电票无发票代码，符合规范")
    if not value:
        return Check("invoice_code", "发票代码", LEVEL_WARN, "未识别到发票代码")
    if len(value) in (10, 12):
        return Check("invoice_code", "发票代码", LEVEL_OK, f"{len(value)} 位代码，格式正常")
    return Check(
        "invoice_code",
        "发票代码",
        LEVEL_WARN,
        f"代码为 {len(value)} 位，应为 10 位或 12 位，请核对",
    )


def _check_tax_no(seller_tax_no: Optional[str]) -> Check:
    value = normalize_identity(seller_tax_no)
    if not value:
        return Check("tax_no", "销售方纳税人识别号", LEVEL_WARN, "未识别到销售方纳税人识别号")
    if len(value) in (15, 17, 18, 20):
        return Check(
            "tax_no", "销售方纳税人识别号", LEVEL_OK, f"{len(value)} 位，格式正常"
        )
    return Check(
        "tax_no",
        "销售方纳税人识别号",
        LEVEL_WARN,
        f"长度为 {len(value)} 位，不属于 15/17/18/20 位，请核对",
    )


def _check_amounts(total: Optional[int], tax: Optional[int]) -> Check:
    if total is None or total <= 0:
        return Check("amounts", "金额", LEVEL_WARN, "未识别到价税合计金额")
    if tax is None:
        return Check("amounts", "金额", LEVEL_WARN, "未识别到税额，无法校验税率关系")
    if tax > total:
        return Check(
            "amounts",
            "金额",
            LEVEL_FAIL,
            f"税额（{_yuan(tax)}）大于价税合计（{_yuan(total)}），票面金额不自洽",
        )

    # 增值税发票恒有「价税合计 = 不含税金额 + 税额」，因此不含税金额可由减法直接得出，
    # 不需要额外识别。若税率落在常见档位上，说明金额与税额是一组自洽的数据。
    excl = total - tax
    if excl <= 0:
        return Check("amounts", "金额", LEVEL_OK, f"金额与税额自洽（税额 {_yuan(tax)}）")
    conventional = any(
        abs(tax - round(excl * rate)) <= _TAX_TOLERANCE_CENTS for rate in _COMMON_RATES
    )
    if conventional:
        rate = round(tax / excl * 100, 2)
        return Check(
            "amounts", "金额", LEVEL_OK, f"金额与税额自洽，推算税率约 {rate}%"
        )
    return Check(
        "amounts",
        "金额",
        LEVEL_FAIL,
        f"税额（{_yuan(tax)}）与不含税金额（{_yuan(excl)}）推算出的税率不在常见档位"
        "（0/1%/3%/5%/6%/9%/13%），金额或税额可能有误",
    )


def _check_date(invoice_date: Optional[str], today: date) -> Check:
    if not invoice_date:
        return Check("date", "开票日期", LEVEL_WARN, "未识别到开票日期")
    m = _DATE_RE.match(normalize_date(invoice_date))
    if not m:
        return Check("date", "开票日期", LEVEL_WARN, f"日期格式异常：{invoice_date}")
    try:
        parsed = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return Check("date", "开票日期", LEVEL_WARN, f"日期不存在：{invoice_date}")
    if parsed.year < _MIN_YEAR:
        return Check("date", "开票日期", LEVEL_WARN, f"日期为 {parsed.isoformat()}，年份过早")
    if parsed > today:
        return Check("date", "开票日期", LEVEL_WARN, f"日期为 {parsed.isoformat()}，晚于今天")
    return Check("date", "开票日期", LEVEL_OK, parsed.isoformat())


def normalize_date(value: str) -> str:
    """接受 2026/3/4、2026.3.4 等写法，统一成 YYYY-MM-DD 再解析"""
    cleaned = value.strip().replace("/", "-").replace(".", "-")
    parts = cleaned.split("-")
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        return f"{int(parts[0]):04d}-{int(parts[1]):02d}-{int(parts[2]):02d}"
    return cleaned


def _yuan(cents: int) -> str:
    return f"{cents / 100:.2f} 元"


def official_verify_elements(
    *,
    invoice_code: Optional[str] = None,
    invoice_no: Optional[str] = None,
    invoice_date: Optional[str] = None,
    total_amount_cents: Optional[int] = None,
    tax_amount_cents: Optional[int] = None,
) -> dict:
    """整理官方查验平台需要的输入项。

    平台要求填「发票代码、发票号码、开票日期、开具金额（不含税）」。数电票没有
    发票代码，该项留空即可。不含税金额由「价税合计 − 税额」推出。
    """
    amount_without_tax = None
    if total_amount_cents is not None and tax_amount_cents is not None:
        amount_without_tax = max(total_amount_cents - tax_amount_cents, 0)
    elif total_amount_cents is not None:
        amount_without_tax = total_amount_cents

    elements = {
        "invoice_code": normalize_identity(invoice_code) or None,
        "invoice_no": normalize_identity(invoice_no) or None,
        "invoice_date": normalize_date(invoice_date) if invoice_date else None,
        "amount_without_tax": (
            f"{amount_without_tax / 100:.2f}" if amount_without_tax is not None else None
        ),
    }
    required = ["invoice_no", "invoice_date", "amount_without_tax"]
    complete = all(elements[key] for key in required)
    return {
        "elements": elements,
        "complete": complete,
        "url": OFFICIAL_VERIFY_URL,
        # 数电票无需发票代码，缺失不代表要素不全
        "missing": [key for key in required if not elements[key]],
    }
