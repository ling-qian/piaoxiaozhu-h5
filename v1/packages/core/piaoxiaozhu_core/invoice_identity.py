"""票据身份指纹 —— 判断「这是不是同一张发票」。

做两件事：
1. 归一化票据身份字段（发票代码、发票号码、销方税号），去掉 OCR 常见的噪声。
2. 用归一化后的字段算出指纹，供查重使用。

指纹分强弱两档，这是刻意的取舍：

- **强指纹**：有发票号码。同一张发票的号码在全国范围内唯一（数电票 20 位号码本身
  即唯一标识，传统发票则需要「发票代码 + 发票号码」共同确定）。命中强指纹基本可以
  断定是同一张票。
- **弱指纹**：只有「销方税号 + 开票日期 + 价税合计」。用于 OCR 没能读出号码的情况。
  它会误伤同一天在同一商户消费的同等金额的两次交易，因此调用方必须把弱指纹命中
  展示为「疑似重复，请人工确认」，而不是直接判重。

没有可用的身份字段时返回 None——宁可不查重，也不要拿「商户名」这种不可靠的字段
去比对：那会把同一家供应商的每一张票都判成重复。
"""

from __future__ import annotations

import hashlib
import re
from typing import Optional

# 指纹版本。算法或字段口径调整时必须升版，否则新旧指纹混在同一个索引里会互相漏判。
FINGERPRINT_VERSION = "v1"

STRENGTH_STRONG = "strong"
STRENGTH_WEAK = "weak"

_ALNUM = re.compile(r"[^0-9A-Za-z]")


def normalize_identity(value: Optional[str]) -> str:
    """去空白、去分隔符、统一大写。发票号码/代码/税号都是纯字母数字，噪声只会拖累比对。"""
    if not value:
        return ""
    return _ALNUM.sub("", str(value)).upper()


def is_einvoice_no(invoice_no: Optional[str]) -> bool:
    """数电票的发票号码固定 20 位且没有发票代码"""
    normalized = normalize_identity(invoice_no)
    return len(normalized) == 20


def invoice_fingerprint(
    *,
    invoice_type: Optional[str] = None,
    invoice_code: Optional[str] = None,
    invoice_no: Optional[str] = None,
    seller_tax_no: Optional[str] = None,
    invoice_date: Optional[str] = None,
    total_amount_cents: Optional[int] = None,
) -> Optional[str]:
    """算出票据指纹。

    返回 (指纹, 强度) 中的指纹部分；拿不到身份字段时返回 None。
    发票类型参与强指纹：同一号码在「专票」和「普票」下不应互相覆盖。
    """
    result = invoice_fingerprint_with_strength(
        invoice_type=invoice_type,
        invoice_code=invoice_code,
        invoice_no=invoice_no,
        seller_tax_no=seller_tax_no,
        invoice_date=invoice_date,
        total_amount_cents=total_amount_cents,
    )
    return result[0] if result else None


def invoice_fingerprint_with_strength(
    *,
    invoice_type: Optional[str] = None,
    invoice_code: Optional[str] = None,
    invoice_no: Optional[str] = None,
    seller_tax_no: Optional[str] = None,
    invoice_date: Optional[str] = None,
    total_amount_cents: Optional[int] = None,
) -> Optional[tuple[str, str]]:
    """返回 (指纹, 强度)，拿不到可用身份字段时返回 None"""
    no = normalize_identity(invoice_no)
    code = normalize_identity(invoice_code)
    type_key = normalize_identity(invoice_type) or "unknown"

    if no:
        # 数电票没有发票代码，号码单独即可唯一定位；传统发票把代码一并纳入，
        # 避免不同年份/版式的号码空间重叠。
        payload = f"{type_key}|{code}|{no}"
        return _digest(payload), STRENGTH_STRONG

    seller = normalize_identity(seller_tax_no)
    date = normalize_identity(invoice_date)
    if seller and date and total_amount_cents is not None and total_amount_cents > 0:
        payload = f"{type_key}|{seller}|{date}|{total_amount_cents}"
        return _digest(payload), STRENGTH_WEAK

    return None


def _digest(payload: str) -> str:
    return f"{FINGERPRINT_VERSION}:{hashlib.sha256(payload.encode('utf-8')).hexdigest()[:40]}"
