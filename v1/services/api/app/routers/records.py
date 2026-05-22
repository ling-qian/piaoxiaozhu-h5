from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceRecord
from app.models.user import User
from app.schemas.record import InvoiceRecordUpdate, InvoiceRecordResponse

router = APIRouter(prefix="/api", tags=["records"])


@router.get("/projects/{project_id}/records", response_model=list[InvoiceRecordResponse])
async def list_records(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InvoiceRecord).where(InvoiceRecord.project_id == project_id, InvoiceRecord.user_id == current_user.id)
    )
    records = result.scalars().all()
    if not records:
        now = datetime.now(timezone.utc)
        return [
            InvoiceRecordResponse(
                id=uuid4(),
                project_id=project_id,
                file_id=uuid4(),
                user_id=current_user.id,
                direction="in",
                merchant_name="示例商户A",
                tax_no="91110000MA01ABCDEF",
                amount=10000.00,
                tax_amount=600.00,
                invoice_date="2025-01-15",
                category_code="30401",
                category_l1="餐饮服务",
                category_l2="餐饮",
                confidence=0.98,
                raw_text=None,
                reason=None,
                is_manual_corrected=False,
                created_at=now,
                updated_at=now,
            ),
            InvoiceRecordResponse(
                id=uuid4(),
                project_id=project_id,
                file_id=uuid4(),
                user_id=current_user.id,
                direction="out",
                merchant_name="示例商户B",
                tax_no="91310000MA1FGHIJKL",
                amount=25000.00,
                tax_amount=1500.00,
                invoice_date="2025-02-20",
                category_code="30101",
                category_l1="信息技术服务",
                category_l2="软件开发",
                confidence=0.95,
                raw_text=None,
                reason=None,
                is_manual_corrected=False,
                created_at=now,
                updated_at=now,
            ),
        ]
    return records


@router.patch("/records/{record_id}", response_model=InvoiceRecordResponse)
async def update_record(
    record_id: str,
    body: InvoiceRecordUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InvoiceRecord).where(InvoiceRecord.id == record_id, InvoiceRecord.user_id == current_user.id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(record, field, value)

    if update_data:
        record.is_manual_corrected = True
    await db.commit()
    await db.refresh(record)
    return record


@router.delete("/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_record(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(InvoiceRecord).where(InvoiceRecord.id == record_id, InvoiceRecord.user_id == current_user.id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    await db.delete(record)
    await db.commit()
