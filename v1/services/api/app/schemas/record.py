from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class InvoiceRecordCreate(BaseModel):
    project_id: UUID
    file_id: Optional[UUID] = None
    direction: str = Field(..., description="in or out")
    merchant_name: Optional[str] = None
    tax_no: Optional[str] = None
    amount: Optional[float] = None
    tax_amount: Optional[float] = None
    invoice_date: Optional[str] = None
    category_code: Optional[str] = None
    category_l1: Optional[str] = None
    category_l2: Optional[str] = None
    confidence: Optional[float] = None
    raw_text: Optional[str] = None
    reason: Optional[str] = None


class InvoiceRecordUpdate(BaseModel):
    direction: Optional[str] = None
    merchant_name: Optional[str] = None
    tax_no: Optional[str] = None
    amount: Optional[float] = None
    tax_amount: Optional[float] = None
    invoice_date: Optional[str] = None
    category_code: Optional[str] = None
    category_l1: Optional[str] = None
    category_l2: Optional[str] = None
    confidence: Optional[float] = None
    reason: Optional[str] = None
    is_manual_corrected: Optional[bool] = None


class InvoiceRecordResponse(BaseModel):
    id: UUID
    project_id: UUID
    file_id: UUID
    user_id: UUID
    direction: str
    merchant_name: Optional[str] = None
    tax_no: Optional[str] = None
    amount: Optional[float] = None
    tax_amount: Optional[float] = None
    invoice_date: Optional[str] = None
    category_code: Optional[str] = None
    category_l1: Optional[str] = None
    category_l2: Optional[str] = None
    confidence: Optional[float] = None
    raw_text: Optional[str] = None
    reason: Optional[str] = None
    is_manual_corrected: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
