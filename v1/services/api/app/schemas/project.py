from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., max_length=256)
    industry: Optional[str] = None
    report_month: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}$")
    customer_id: Optional[UUID] = None


class ProjectResponse(BaseModel):
    id: UUID
    user_id: UUID
    customer_id: Optional[UUID] = None
    name: str
    industry: Optional[str] = None
    report_month: Optional[str] = None
    status: str = "draft"
    created_at: datetime
    record_count: int = 0
    total_cost: float = 0.0
    total_income: float = 0.0

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    items: List[ProjectResponse]
    total: int
