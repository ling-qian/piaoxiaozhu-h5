"""发票额度统计与校验。

统计口径与 H5 端（piaoxiaozhu-h5/app/api/ocr/route.ts）保持一致：
按自然月统计该用户当月的全部流水记录数，达到套餐上限后拒绝识别。
"""

from datetime import datetime, timezone
from typing import Optional, Tuple
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import InvoiceRecord
from app.services.plan_config import check_invoice_limit


def month_start(now: Optional[datetime] = None) -> datetime:
    """当月起始时刻（UTC），对齐 H5 端 new Date(y, m, 1) 的语义"""
    current = now or datetime.now(timezone.utc)
    return current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def count_invoices_this_month(db: AsyncSession, user_id: UUID) -> int:
    """该用户当月已产生的发票记录数"""
    result = await db.execute(
        select(func.count())
        .select_from(InvoiceRecord)
        .where(
            InvoiceRecord.user_id == user_id,
            InvoiceRecord.created_at >= month_start(),
        )
    )
    return result.scalar() or 0


async def resolve_invoice_usage(
    db: AsyncSession, user_id: UUID, plan_code: Optional[str]
) -> Tuple[bool, int, int]:
    """返回 (是否还有额度, 限额, 当月已用)"""
    used = await count_invoices_this_month(db, user_id)
    return check_invoice_limit(plan_code, used)
