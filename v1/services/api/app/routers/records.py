from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceRecord
from app.models.user import User
from app.schemas.record import InvoiceRecordCreate, InvoiceRecordUpdate, InvoiceRecordResponse

router = APIRouter(prefix="/api", tags=["records"])


@router.get("/projects/{project_id}/records")
async def list_records(
    project_id: str,
    direction: Optional[str] = None,
    category_code: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(InvoiceRecord).where(
        InvoiceRecord.project_id == project_id,
        InvoiceRecord.user_id == current_user.id,
    )

    if direction:
        query = query.where(InvoiceRecord.direction == direction)
    if category_code:
        query = query.where(InvoiceRecord.category_code == category_code)

    count_result = await db.execute(
        select(func.count()).select_from(InvoiceRecord).where(
            InvoiceRecord.project_id == project_id,
            InvoiceRecord.user_id == current_user.id,
        )
    )
    total = count_result.scalar() or 0

    query = query.order_by(InvoiceRecord.created_at.desc())
    query = query.offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    records = result.scalars().all()

    return {
        "items": [
            {
                "id": str(r.id),
                "project_id": str(r.project_id),
                "file_id": str(r.file_id),
                "user_id": str(r.user_id),
                "direction": r.direction,
                "merchant_name": r.merchant_name,
                "tax_no": r.tax_no,
                "amount": float(r.amount) if r.amount is not None else None,
                "tax_amount": float(r.tax_amount) if r.tax_amount is not None else None,
                "invoice_date": r.invoice_date,
                "category_code": r.category_code,
                "category_l1": r.category_l1,
                "category_l2": r.category_l2,
                "confidence": float(r.confidence) if r.confidence is not None else None,
                "raw_text": r.raw_text,
                "reason": r.reason,
                "is_manual_corrected": r.is_manual_corrected,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in records
        ],
        "total": total,
        "page": page,
        "size": size,
    }


@router.post("/records", status_code=status.HTTP_201_CREATED)
async def create_record(
    body: InvoiceRecordCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    record = InvoiceRecord(
        project_id=body.project_id if hasattr(body, "project_id") else None,
        file_id=body.file_id if hasattr(body, "file_id") else None,
        user_id=current_user.id,
        direction=body.direction,
        merchant_name=body.merchant_name,
        tax_no=body.tax_no,
        amount=body.amount,
        tax_amount=body.tax_amount,
        invoice_date=body.invoice_date,
        category_code=body.category_code,
        category_l1=body.category_l1,
        category_l2=body.category_l2,
        confidence=body.confidence,
        raw_text=body.raw_text,
        reason=body.reason,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return {"id": str(record.id), "action": "created"}


@router.patch("/records/{record_id}")
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

    return {
        "id": str(record.id),
        "is_manual_corrected": record.is_manual_corrected,
        "updated_fields": list(update_data.keys()),
    }


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
