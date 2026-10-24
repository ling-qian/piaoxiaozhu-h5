"""查重 —— 找出「这张票已经录过一次了」。

两层，与 core 的 invoice_identity 指纹互补：

1. **发票指纹查重**：同一张发票的号码唯一，命中强指纹基本可以断定重复。
   弱指纹（销方税号 + 日期 + 金额）会误伤同一天同店同等金额的两次消费，因此
   只作为「疑似」，由前端提示用户确认。
2. **文件哈希查重**：同一张图片/XML 被重复上传。用于 OCR 没能读出号码的情况。

查重在**用户维度**进行（不限于单个项目）：同一张票被录进两个项目，正是最需要
提醒的场景。跨用户不比对——那既涉及隐私，也不是用户能处理的重复。
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import InvoiceFile, InvoiceRecord


async def find_duplicate_record(
    db: AsyncSession,
    user_id: UUID,
    fingerprint: Optional[str],
    exclude_record_id: Optional[UUID] = None,
) -> Optional[InvoiceRecord]:
    """按指纹找该用户已存在的同票记录。

    取最早的一条作为「原件」：后来者指向它，用户看到的始终是同一个引用目标，
    不会因为记录被删除或顺序变化而指向漂移。
    """
    if not fingerprint:
        return None

    query = select(InvoiceRecord).where(
        InvoiceRecord.user_id == user_id,
        InvoiceRecord.invoice_fingerprint == fingerprint,
    )
    if exclude_record_id is not None:
        query = query.where(InvoiceRecord.id != exclude_record_id)

    result = await db.execute(query.order_by(InvoiceRecord.created_at.asc()).limit(1))
    return result.scalars().first()


async def find_duplicate_file(
    db: AsyncSession,
    user_id: UUID,
    file_hash: Optional[str],
    exclude_file_id: Optional[UUID] = None,
) -> Optional[InvoiceFile]:
    """按文件哈希找该用户已上传过的同一份原始文件"""
    if not file_hash:
        return None

    query = select(InvoiceFile).where(
        InvoiceFile.user_id == user_id,
        InvoiceFile.file_hash == file_hash,
    )
    if exclude_file_id is not None:
        query = query.where(InvoiceFile.id != exclude_file_id)

    result = await db.execute(query.order_by(InvoiceFile.created_at.asc()).limit(1))
    return result.scalars().first()
