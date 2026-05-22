from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class InvoiceRecordCreate(BaseModel):
    direction: str = Field(..., description="in or out")
    merchant_name: str | None = None
    tax_no: str | None = None
    amount: float | None = None
    tax_amount: float | None = None
    invoice_date: str | None = None
    category_code: str | None = None
    category_l1: str | None = None
    category_l2: str | None = None
    confidence: float | None = None
    raw_text: str | None = None
    reason: str | None = None


class InvoiceRecordUpdate(BaseModel):
    direction: str | None = None
    merchant_name: str | None = None
    tax_no: str | None = None
    amount: float | None = None
    tax_amount: float | None = None
    invoice_date: str | None = None
    category_code: str | None = None
    category_l1: str | None = None
    category_l2: str | None = None
    confidence: float | None = None
    reason: str | None = None
    is_manual_corrected: bool | None = None


class InvoiceRecordResponse(BaseModel):
    id: UUID
    project_id: UUID
    file_id: UUID
    user_id: UUID
    direction: str
    merchant_name: str | None = None
    tax_no: str | None = None
    amount: float | None = None
    tax_amount: float | None = None
    invoice_date: str | None = None
    category_code: str | None = None
    category_l1: str | None = None
    category_l2: str | None = None
    confidence: float | None = None
    raw_text: str | None = None
    reason: str | None = None
    is_manual_corrected: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
