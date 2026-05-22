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


_MERCHANT_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"销售方名称[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"销售方[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"商户名称[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"商户[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"收款单位[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"开票方[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"销方[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"销售方信息[：:]\s*(.+?)(?:\s|$)"),
    re.compile(r"名称[：:]\s*(.+?)(?:\s|$)"),
]

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
    (re.compile(r"电子发票[\s\S]*?增值税专用"), "vat_special_electronic"),
    (re.compile(r"电子发票[\s\S]*?增值税普通"), "vat_normal_electronic"),
    (re.compile(r"增值税专用发票"), "vat_special"),
    (re.compile(r"增值税普通发票"), "vat_normal"),
    (re.compile(r"电子发票"), "electronic"),
    (re.compile(r"机打发票"), "machine_printed"),
    (re.compile(r"收据"), "receipt"),
    (re.compile(r"小票"), "receipt"),
]


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
    )


def _extract_merchant(text: str) -> Optional[str]:
    for pattern in _MERCHANT_PATTERNS:
        m = pattern.search(text)
        if m:
            value = m.group(1).strip()
            if value:
                return value

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

    rate_match = re.search(r"税[率率][：:]*\s*(\d+(?:\.\d+)?)\s*%", text)
    if rate_match:
        rate = float(rate_match.group(1)) / 100.0
        total = _extract_total(text)
        if total and total > 0 and rate > 0:
            tax_cents = round(total * rate / (1 + rate))
            if tax_cents > 0:
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
