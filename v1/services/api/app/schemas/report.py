from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ReportResponse(BaseModel):
    id: UUID
    project_id: UUID
    version: int
    summary: str | None = None
    detail_json: str | None = None
    share_token: str | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ShareResponse(BaseModel):
    share_token: str
    share_url: str
