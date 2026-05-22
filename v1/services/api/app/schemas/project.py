from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., max_length=256)
    industry: str | None = None
    report_month: str | None = Field(None, pattern=r"^\d{4}-\d{2}$")
    customer_id: UUID | None = None


class ProjectResponse(BaseModel):
    id: UUID
    user_id: UUID
    customer_id: UUID | None = None
    name: str
    industry: str | None = None
    report_month: str | None = None
    status: str = "draft"
    created_at: datetime
    record_count: int = 0
    total_cost: float = 0.0
    total_income: float = 0.0

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    items: list[ProjectResponse]
    total: int
