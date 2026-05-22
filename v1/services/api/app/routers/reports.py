import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.project import Project
from app.models.report import ReportSnapshot
from app.models.user import User
from app.schemas.report import ReportResponse, ShareResponse

router = APIRouter(prefix="/api", tags=["reports"])

MOCK_REPORT_DETAIL = {
    "summary": "本月进项发票总额 ¥35,000.00，销项发票总额 ¥120,000.00，应纳税额 ¥5,100.00。",
    "inbound": {"total_amount": 35000.00, "total_tax": 2100.00, "count": 5},
    "outbound": {"total_amount": 120000.00, "total_tax": 7200.00, "count": 8},
    "categories": [
        {"category_l1": "餐饮服务", "amount": 10000.00, "tax": 600.00},
        {"category_l1": "信息技术服务", "amount": 25000.00, "tax": 1500.00},
    ],
    "anomalies": [
        {"record_id": "mock", "reason": "金额异常偏高", "confidence": 0.72},
    ],
}


@router.get("/projects/{project_id}/report", response_model=ReportResponse)
async def get_report(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ReportSnapshot).where(
            ReportSnapshot.project_id == project_id,
            ReportSnapshot.user_id == current_user.id,
        ).order_by(ReportSnapshot.version.desc())
    )
    report = result.scalars().first()

    if report is None:
        now = datetime.now(timezone.utc)
        return ReportResponse(
            id=uuid.uuid4(),
            project_id=project_id,
            version=1,
            summary=MOCK_REPORT_DETAIL["summary"],
            detail_json=json.dumps(MOCK_REPORT_DETAIL, ensure_ascii=False),
            share_token=None,
            status="generated",
            created_at=now,
        )
    return report


@router.get("/projects/{project_id}/report/export")
async def export_report(
    project_id: str,
    fmt: str = "json",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if fmt == "json":
        return JSONResponse(content=MOCK_REPORT_DETAIL)
    return JSONResponse(content={"message": f"Export format '{fmt}' not yet supported", "data": MOCK_REPORT_DETAIL})


@router.post("/projects/{project_id}/report/share", response_model=ShareResponse)
async def share_report(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    share_token = uuid.uuid4().hex
    share_url = f"https://app.piaoxiaozhu.com/share/{share_token}"
    return ShareResponse(share_token=share_token, share_url=share_url)
