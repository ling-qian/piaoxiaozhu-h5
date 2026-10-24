from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ExtractedFields:
    merchant_name: Optional[str] = None
    total_amount: Optional[int] = None
    tax_amount: Optional[int] = None
    invoice_date: Optional[str] = None
    invoice_type: Optional[str] = None
    # 票据身份四要素，用于查重与票面自检。数电票只有 20 位发票号码、没有发票代码，
    # 因此 invoice_code 在数电票上是 None 属正常情况，不能当成识别失败。
    invoice_code: Optional[str] = None
    invoice_no: Optional[str] = None
    seller_tax_no: Optional[str] = None


# 带「销售方」语义的显式字段。这里刻意不含裸「名称」：增值税发票的版式是
# 购买方在前、销售方在后，裸「名称」必然先命中购买方，会把客户名当成供应商名。
_SELLER_LABEL_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"销售方名称[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"销方名称[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"销售方[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"商户名称[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"商户[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"收款单位[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"开票方[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"销方[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"销售方信息[：:]\s*(.+?)(?:\s|$)"),
]

# 发票上的区块标题。OCR 常把「销售方信息」单独识别成一行（后面不跟冒号），
# 所以不能只靠「销售方：」这种带冒号的写法来定位。
_SELLER_SECTION = re.compile(r"销售方|销方|销售单位|销货单位")
# 排除「项目名称/货物名称」等表头——它们也是「名称：」，但不是商户。
_NAME_LINE = re.compile(r"(?<![目物])名称[：:]\s*([^\n]+)")

# 「销售方 名称：」在真实发票里常被 OCR 拆成多行（销售方 / 名 / 称：京东大药房…），
# 用 \s* 容忍换行才能定位到。增值税发票的商户名主要来源，必须排在所有模式之前。
_SELLER_SPLIT_PATTERN = re.compile(r"销售方\s*名\s*称\s*[：:]\s*([^\n]+)")

# 盖章碎片：发票末尾的「销售方：（章」「发票专用章」是签章残留，不是商户名。
# 曾经的实测事故：`销售方[：:]` 模式命中了盖章行，商户名被写成「（章」。
_SEAL_NOISE_PATTERN = re.compile(r"[（(【\[\s]*(?:发票专用章|专用章|章)[）)】\]\s]*")

# 紧跟商户名出现的其它字段标签。OCR 有时把相邻表格单元并成一行，
# 需要在这些标签处截断，否则会把「纳税人识别号」等一起当成商户名。
_FOLLOWING_LABELS = re.compile(r"统一社会信用代码|纳税人识别号|纳税识别号|税号|开户行|银行账号|地址|电话")

# 明细行的「不含税金额 / 税率 / 税额」三列。OCR 有时会把相邻单元格并成一个框，
# 得到形如 "124.763%3.74" 的粘连文本；税率夹在两段金额中间，位置比裸 "%" 可靠。
_ITEM_ROW_TAX = re.compile(r"\d+\.\d{2}\s*(\d{1,2})\s*%\s*\d+\.\d{2}")

_DATE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日"),
    re.compile(r"(\d{4})-(\d{1,2})-(\d{1,2})"),
    re.compile(r"(\d{4})/(\d{1,2})/(\d{1,2})"),
    re.compile(r"(\d{4})\.(\d{1,2})\.(\d{1,2})"),
]

_DATE_PREFIX_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"开票日期[：:]\s*(.+)"),
    re.compile(r"日期[：:]\s*(.+)"),
    re.compile(r"开具日期[：:]\s*(.+)"),
    re.compile(r"时间[：:]\s*(.+)"),
]

_INVOICE_TYPE_MAP: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"增值税.*?电子.*?专用"), "vat_special_electronic"),
    (re.compile(r"增值税.*?电子.*?普通"), "vat_normal_electronic"),
    (re.compile(r"电子发票[\s\S]*?增值税专用"), "vat_special_electronic"),
    (re.compile(r"电子发票[\s\S]*?增值税普通"), "vat_normal_electronic"),
    (re.compile(r"增值税专用发票"), "vat_special"),
    (re.compile(r"增值税普通发票"), "vat_normal"),
    (re.compile(r"电子发票"), "electronic"),
    (re.compile(r"机打发票"), "machine_printed"),
    (re.compile(r"收据"), "receipt"),
    (re.compile(r"小票"), "receipt"),
]


_INVOICE_CODE_PATTERN = re.compile(r"发票代码[：:]*\s*(\d{10,12})(?!\d)")

# 数电票（全电发票）的发票号码固定 20 位且没有发票代码，传统增值税发票为 8 位。
# 两种形态都要求号码后面不再跟数字，否则会把相邻的「机器编号」等一起吞进来。
_INVOICE_NO_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"发票号码[：:]*\s*(\d{20})(?!\d)"),
    re.compile(r"发票号码[：:]*\s*(\d{8})(?!\d)"),
]

# 纳税人识别号（销方税号）的无标签兜底。购买方在前、销售方在后，因此取最后一个，
# 与 _extract_merchant 的取舍方向一致。
_TAX_NO_PATTERN = re.compile(
    r"(?:纳税人识别号|纳税人识别码|统一社会信用代码|税号)[：:]*\s*([0-9A-Z]{15,20})(?![0-9A-Z])"
)


def extract_fields(raw_text: str) -> ExtractedFields:
    if not raw_text:
        return ExtractedFields()

    merchant = _extract_merchant(raw_text)
    total = _extract_total(raw_text)
    tax = _extract_tax(raw_text)
    date = _extract_date(raw_text)
    inv_type = _extract_type(raw_text)

    return ExtractedFields(
        merchant_name=merchant,
        total_amount=total,
        tax_amount=tax,
        invoice_date=date,
        invoice_type=inv_type,
        invoice_code=_extract_invoice_code(raw_text),
        invoice_no=_extract_invoice_no(raw_text),
        seller_tax_no=_extract_seller_tax_no(raw_text),
    )


def _extract_invoice_code(text: str) -> Optional[str]:
    m = _INVOICE_CODE_PATTERN.search(text)
    return m.group(1) if m else None


def _extract_invoice_no(text: str) -> Optional[str]:
    for pattern in _INVOICE_NO_PATTERNS:
        m = pattern.search(text)
        if m:
            return m.group(1)
    return None


def _extract_seller_tax_no(text: str) -> Optional[str]:
    matches = [m.group(1) for m in _TAX_NO_PATTERN.finditer(text)]
    return matches[-1].upper() if matches else None


def _clean_merchant(value: str) -> Optional[str]:
    value = _FOLLOWING_LABELS.split(value)[0]
    value = value.strip().strip("：:，,。.、 ")
    return value or None


def _is_seal_noise(value: str) -> bool:
    """判断是否为盖章碎片（如「（章」「发票专用章」）而非真实商户名。"""
    if not value:
        return True
    if _SEAL_NOISE_PATTERN.fullmatch(value.strip()):
        return True
    # 去掉各种括号与空白后只剩「章」一类，同样视为签章残留
    stripped = re.sub(r"[（()）【】\[\]{}\s]", "", value)
    return stripped in {"章", "发票专用章", "专用章", "发票章", "财务专用章"}


def _extract_merchant(text: str) -> Optional[str]:
    # 0) 容忍换行的「销售方 名称：」优先。它天然不会命中盖章行——盖章行是
    #    「销售方：（章」，中间没有「名称」二字。
    m = _SELLER_SPLIT_PATTERN.search(text)
    if m:
        value = _clean_merchant(m.group(1))
        if value and not _is_seal_noise(value):
            return value

    # 1) 显式的销售方字段最可靠。命中盖章碎片时不能直接返回，要继续往后找，
    #    否则商户名会变成「（章」；所有模式都只拿到盖章碎片时，才走后面的兜底。
    for pattern in _SELLER_LABEL_PATTERNS:
        m = pattern.search(text)
        if m:
            value = _clean_merchant(m.group(1))
            if value and not _is_seal_noise(value):
                return value

    # 2) 定位「销售方」区块，取其后的第一个「名称」
    names = list(_NAME_LINE.finditer(text))
    if names:
        seller = _SELLER_SECTION.search(text)
        if seller:
            for nm in names:
                if nm.start() > seller.end():
                    value = _clean_merchant(nm.group(1))
                    if value:
                        return value
        # 没有销售方区块标记时，按「购买方在前、销售方在后」取最后一个「名称」
        if len(names) > 1:
            value = _clean_merchant(names[-1].group(1))
            if value:
                return value
        value = _clean_merchant(names[0].group(1))
        if value:
            return value

    # 3) 兜底：逐行挑第一个像商户名的行
    lines = text.strip().split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if re.search(r"\d{4}", line):
            continue
        if re.search(r"^\d+[\.\,]?\d*$", line):
            continue
        if re.search(r"^[\d\.\,¥￥\-\s]+$", line):
            continue
        # 先去掉行首的「销售方：」这类标签，否则返回的商户名会带上标签前缀
        line = re.sub(r"^(?:销售方|销方|收款单位|开票方|商户)\s*[：:]\s*", "", line).strip()
        # 再挡盖章行：整行「销售方：（发票专用章）」剥掉标签后就是纯盖章碎片。
        # 顺序很重要——先判章会漏掉这种带标签的整行盖章。
        if _is_seal_noise(line):
            continue
        if len(line) >= 2 and not re.match(r"^[\W\d]+$", line):
            return line

    return None


def _parse_yuan_to_cents(value_str: str) -> int:
    cleaned = value_str.replace(",", "").replace("，", "").replace("￥", "").replace("¥", "").strip()
    try:
        yuan = float(cleaned)
        return round(yuan * 100)
    except ValueError:
        return 0


def _extract_total(text: str) -> Optional[int]:
    total_patterns: list[re.Pattern[str]] = [
        re.compile(r"(?:价税合计|合[计總]|总[计計]|应付金额|实付金额|总计金额|合计金额)[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)"),
        re.compile(r"[¥￥]\s*([\d,，]+\.?\d*)"),
        re.compile(r"(?:金[额額])[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)"),
    ]

    for pattern in total_patterns:
        m = pattern.search(text)
        if m:
            cents = _parse_yuan_to_cents(m.group(1))
            if cents > 0:
                return cents

    all_numbers: list[tuple[int, re.Match[str]]] = []
    for m in re.finditer(r"([\d,，]+\.\d{1,2})", text):
        cents = _parse_yuan_to_cents(m.group(1))
        if cents > 0:
            all_numbers.append((cents, m))

    if all_numbers:
        all_numbers.sort(key=lambda x: x[0], reverse=True)
        return all_numbers[0][0]

    return None


def _extract_tax_rate(text: str) -> Optional[float]:
    """提取票面税率（小数形式）。

    「税率」在表格式发票里常常只是列头，真正的百分比在下一行的明细里，
    所以不能要求百分比紧跟在标签后面，只要求它出现在标签之后。
    """
    # 1) 明细行三列被 OCR 并成一段时，税率夹在两条金额中间，例如 "124.763%3.74"。
    #    先判这种形态，比单看 "%" 可靠得多。前缀 (?<![\d.]) 用来防止把
    #    "124.763%" 里的 "24.763" 当成税率。
    m = _ITEM_ROW_TAX.search(text)
    if m and 0 < float(m.group(1)) <= 20:
        return float(m.group(1)) / 100.0

    # 2) 「税率」标签之后的第一个独立百分比
    anchor = re.search(r"税率|征收率", text)
    if anchor:
        m = re.search(r"(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*%", text[anchor.end():])
        if m and 0 < float(m.group(1)) <= 20:
            return float(m.group(1)) / 100.0

    # 3) 无「税率」标签时，取全文第一个独立百分比；上限 20% 是为了避开
    #    折扣、涨幅等非税率的百分数。
    for m in re.finditer(r"(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*%", text):
        if 0 < float(m.group(1)) <= 20:
            return float(m.group(1)) / 100.0

    return None


def _extract_tax(text: str) -> Optional[int]:
    tax_patterns: list[re.Pattern[str]] = [
        re.compile(r"(?:税[额額]|税款|增值税额|合计税额)[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)"),
        re.compile(r"(?:税[额額])[：:]*\s*[¥￥]?\s*([\d,，]+\.?\d*)"),
    ]

    for pattern in tax_patterns:
        m = pattern.search(text)
        if m:
            cents = _parse_yuan_to_cents(m.group(1))
            if cents > 0:
                return cents

    # 表格式发票里「税额」常只是列头，其下明细中的数字没有标签可挂。
    # 此时用「价税合计 ÷ (1 + 税率) × 税率」反推——这是价内税的固定算法
    # （价税合计为含税价，而非「金额 × 税率」）。
    rate = _extract_tax_rate(text)
    if rate:
        total = _extract_total(text)
        if total and 0 < rate < 1:
            tax_cents = round(total * rate / (1 + rate))
            if 0 < tax_cents < total:
                return tax_cents

    return None


def _normalize_date(year: str, month: str, day: str) -> str:
    return f"{year}-{int(month):02d}-{int(day):02d}"


def _extract_date(text: str) -> Optional[str]:
    for prefix_pattern in _DATE_PREFIX_PATTERNS:
        m = prefix_pattern.search(text)
        if m:
            date_str = m.group(1).strip()
            for date_pattern in _DATE_PATTERNS:
                dm = date_pattern.search(date_str)
                if dm:
                    return _normalize_date(dm.group(1), dm.group(2), dm.group(3))

    for date_pattern in _DATE_PATTERNS:
        m = date_pattern.search(text)
        if m:
            return _normalize_date(m.group(1), m.group(2), m.group(3))

    return None


def _extract_type(text: str) -> Optional[str]:
    for pattern, type_code in _INVOICE_TYPE_MAP:
        if pattern.search(text):
            return type_code
    return None
