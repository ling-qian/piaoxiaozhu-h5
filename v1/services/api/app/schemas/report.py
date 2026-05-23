from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class ReportResponse(BaseModel):
    id: UUID
    project_id: UUID
    version: int
    summary: Optional[str] = None
    detail_json: Optional[str] = None
    share_token: Optional[str] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ShareResponse(BaseModel):
    share_token: str
    share_url: str
