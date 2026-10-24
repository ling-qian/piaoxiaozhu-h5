"""发票验真服务 —— 把 core 的票面自检跑在一条记录上并落库。

这里只做两件事，且必须对外表述准确：

1. **票面结构自检**（本地、无需任何凭据、随时可跑）：见 core `invoice_check`。
   能抓住金额/税额自相矛盾、号码位数不对、日期异常这类破绽。
2. **整理官方查验要素**：把查验平台要填的四项整理出来，附上官方入口链接，
   让用户自己完成真伪确认。

**没有**接入任何第三方查验 API，也**没有**实现发票代码校验位（检索确认官方规则
里发票代码并无校验位，详见 core `invoice_check` 的模块说明）。因此 API 返回里
`channel` 恒为 `local`，前端文案也必须说「票面自检」而不是「已验真」。
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from piaoxiaozhu_core.invoice_check import (
    check_invoice,
    derive_verdict,
    official_verify_elements,
)

from app.models.invoice import InvoiceRecord

VERIFY_CHANNEL_LOCAL = "local"


def _to_cents(amount: Optional[float]) -> Optional[int]:
    """Numeric(12,2) 读出来是 Decimal，转成分再参与算式校验，避开浮点误差"""
    if amount is None:
        return None
    return int(round(float(amount) * 100))


def build_verify_payload(record: InvoiceRecord, now: Optional[datetime] = None) -> dict:
    """算出一条记录的验真结果（不落库，便于纯函数式测试）"""
    checks = check_invoice(
        invoice_type=None,
        invoice_code=record.invoice_code,
        invoice_no=record.invoice_no,
        seller_tax_no=record.tax_no,
        invoice_date=record.invoice_date,
        total_amount_cents=_to_cents(record.amount),
        tax_amount_cents=_to_cents(record.tax_amount),
    )
    verdict = derive_verdict(checks)
    official = official_verify_elements(
        invoice_code=record.invoice_code,
        invoice_no=record.invoice_no,
        invoice_date=record.invoice_date,
        total_amount_cents=_to_cents(record.amount),
        tax_amount_cents=_to_cents(record.tax_amount),
    )

    return {
        "status": verdict,
        "channel": VERIFY_CHANNEL_LOCAL,
        "checked_at": (now or datetime.now(timezone.utc)).isoformat(),
        "checks": [
            {"key": c.key, "label": c.label, "level": c.level, "detail": c.detail}
            for c in checks
        ],
        "official": official,
    }


def persist_verify(record: InvoiceRecord, payload: dict) -> None:
    """把验真结果写回记录。明细存 JSON 文本，前端可直接渲染逐项结果。"""
    record.verify_status = payload["status"]
    record.verify_detail = json.dumps(
        {"checks": payload["checks"], "official": payload["official"]},
        ensure_ascii=False,
    )
    record.verify_checked_at = datetime.now(timezone.utc)


async def verify_record(record: InvoiceRecord, db) -> dict:
    """跑自检 → 落库 → 返回结果。调用方负责 commit。"""
    payload = build_verify_payload(record)
    persist_verify(record, payload)
    await db.flush()
    return payload
