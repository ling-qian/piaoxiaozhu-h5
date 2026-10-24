from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class InvoiceRecordCreate(BaseModel):
    project_id: UUID
    file_id: Optional[UUID] = None
    # 只接受 out/income，避免写入统计与报表无法识别的值
    direction: Literal["out", "income"] = Field(..., description="out(支出) 或 income(收入)")
    merchant_name: Optional[str] = None
    tax_no: Optional[str] = None
    # 与 Numeric(12,2) 对齐：超界值入库会直接报 DataError，提前在入参拦截
    amount: Optional[float] = Field(default=None, ge=-9999999999.99, le=9999999999.99)
    tax_amount: Optional[float] = Field(default=None, ge=-9999999999.99, le=9999999999.99)
    invoice_date: Optional[str] = None
    # 票据身份字段：手工录入时用户可直接填号码，查重才有输入可用。
    invoice_code: Optional[str] = Field(default=None, max_length=32)
    invoice_no: Optional[str] = Field(default=None, max_length=32)
    category_code: Optional[str] = None
    category_l1: Optional[str] = None
    category_l2: Optional[str] = None
    confidence: Optional[float] = None
    raw_text: Optional[str] = None
    reason: Optional[str] = None


class InvoiceRecordUpdate(BaseModel):
    # 只接受 out/income，否则改出后端统计与报表无法识别的值
    direction: Optional[Literal["out", "income"]] = None
    merchant_name: Optional[str] = None
    tax_no: Optional[str] = None
    amount: Optional[float] = Field(default=None, ge=-9999999999.99, le=9999999999.99)
    tax_amount: Optional[float] = Field(default=None, ge=-9999999999.99, le=9999999999.99)
    invoice_date: Optional[str] = None
    # 用户核对后发现号码识别错了也能改，改完会重算查重指纹。
    invoice_code: Optional[str] = Field(default=None, max_length=32)
    invoice_no: Optional[str] = Field(default=None, max_length=32)
    category_code: Optional[str] = None
    category_l1: Optional[str] = None
    category_l2: Optional[str] = None
    confidence: Optional[float] = None
    reason: Optional[str] = None
    is_manual_corrected: Optional[bool] = None


class InvoiceRecordResponse(BaseModel):
    id: UUID
    project_id: UUID
    file_id: Optional[UUID] = None
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
