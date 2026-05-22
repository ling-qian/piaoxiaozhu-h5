import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceFile, InvoiceRecord
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/api", tags=["manual-income"])


class ManualIncomeRequest(BaseModel):
    month: str = Field(..., pattern=r"^\d{4}-\d{2}$", description="月份，格式 YYYY-MM")
    amount: float = Field(..., gt=0, description="金额（元）")


@router.post("/projects/{project_id}/manual-income", status_code=status.HTTP_201_CREATED)
async def create_manual_income(
    project_id: str,
    body: ManualIncomeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id, Project.user_id == current_user.id
        )
    )
    project = project_result.scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )

    existing = await db.execute(
        select(InvoiceRecord).where(
            InvoiceRecord.project_id == project_id,
            InvoiceRecord.user_id == current_user.id,
            InvoiceRecord.direction == "income",
            InvoiceRecord.merchant_name == "手工录入",
            InvoiceRecord.invoice_date == body.month,
        )
    )
    existing_record = existing.scalar_one_or_none()

    if existing_record is not None:
        existing_record.amount = body.amount
        existing_record.is_manual_corrected = True
        await db.commit()
        await db.refresh(existing_record)
        return {
            "id": str(existing_record.id),
            "project_id": project_id,
            "direction": "income",
            "merchant_name": "手工录入",
            "amount": float(existing_record.amount),
            "invoice_date": existing_record.invoice_date,
            "category_code": existing_record.category_code,
            "action": "updated",
        }

    dummy_file_result = await db.execute(
        select(InvoiceFile).where(InvoiceFile.project_id == project_id).limit(1)
    )
    dummy_file = dummy_file_result.scalar_one_or_none()
    file_id = dummy_file.id if dummy_file else uuid.uuid4()

    if dummy_file is None:
        placeholder_file = InvoiceFile(
            id=file_id,
            project_id=project_id,
            user_id=current_user.id,
            file_url="",
            file_key="manual-income-placeholder",
            source="manual",
            ocr_status="skipped",
            parse_status="skipped",
        )
        db.add(placeholder_file)

    record = InvoiceRecord(
        project_id=project_id,
        file_id=file_id,
        user_id=current_user.id,
        direction="income",
        merchant_name="手工录入",
        amount=body.amount,
        tax_amount=0,
        invoice_date=body.month,
        category_code="income",
        category_l1="营业收入",
        category_l2="手工录入",
        confidence=1.0,
        raw_text="",
        reason="手工录入收入",
        is_manual_corrected=False,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return {
        "id": str(record.id),
        "project_id": project_id,
        "direction": "income",
        "merchant_name": "手工录入",
        "amount": float(record.amount),
        "invoice_date": record.invoice_date,
        "category_code": record.category_code,
        "action": "created",
    }
