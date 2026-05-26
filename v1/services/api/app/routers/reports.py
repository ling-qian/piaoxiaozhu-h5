import io
import json
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceRecord
from app.models.project import Project
from app.models.report import ReportSnapshot
from app.models.user import User
from app.schemas.report import ReportResponse, ShareResponse
from piaoxiaozhu_core.report import build_restaurant_poc_report, format_cents, format_percent
from piaoxiaozhu_core.export import export_csv, export_excel, ExportRecord

router = APIRouter(prefix="/api", tags=["reports"])


async def _get_project_records(
    project_id: str, user_id, db: AsyncSession, month: Optional[str] = None
) -> list:
    q = select(InvoiceRecord).where(
        InvoiceRecord.project_id == project_id,
        InvoiceRecord.user_id == user_id,
    )
    if month:
        q = q.where(InvoiceRecord.invoice_date.startswith(month))
    result = await db.execute(q)
    return result.scalars().all()


def _records_to_report_input(records: list) -> list:
    class _Rec:
        __slots__ = ("type", "total", "category_code")

        def __init__(self, type_, total, category_code):
            self.type = type_
            self.total = total
            self.category_code = category_code

    items = []
    for r in records:
        amount_cents = int(float(r.amount or 0) * 100)
        items.append(_Rec(r.direction, amount_cents, r.category_code or "other"))
    return items


def _records_to_export_records(records: list) -> list:
    items = []
    for r in records:
        issued = None
        if r.invoice_date:
            try:
                issued = date.fromisoformat(r.invoice_date)
            except (ValueError, TypeError):
                issued = None
        items.append(
            ExportRecord(
                name=r.merchant_name,
                merchant=r.merchant_name,
                total=int(float(r.amount or 0) * 100),
                type=r.direction,
                category_code=r.category_code,
                category_l1=r.category_l1,
                issued_at=issued,
                note=r.reason,
                tax_amount=int(float(r.tax_amount or 0) * 100),
                raw_text=r.raw_text,
            )
        )
    return items


async def _verify_project_owner(
    project_id: str, user_id, db: AsyncSession
) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.get("/projects/{project_id}/report", response_model=ReportResponse)
async def get_report(
    project_id: str,
    month: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_project_owner(project_id, current_user.id, db)

    records = await _get_project_records(project_id, current_user.id, db, month=month)
    report_input = _records_to_report_input(records)
    report = build_restaurant_poc_report(report_input)

    cost_by_category = [
        {
            "category_code": c.category_code,
            "category_l2": c.name,
            "name": c.name,
            "total_amount": c.amount / 100,
        }
        for c in report.cost_by_category
    ]

    detail = {
        "total_income": report.total_income / 100,
        "total_cost": report.total_cost / 100,
        "gross_profit": report.gross_profit / 100,
        "gross_margin": round(report.gross_margin * 100, 2),
        "cost_by_category": cost_by_category,
        "total_records": len(records),
    }

    summary = (
        f"{'月份' + month if month else '全部'}："
        f"总收入 ¥{format_cents(report.total_income)}，"
        f"总成本 ¥{format_cents(report.total_cost)}，"
        f"毛利润 ¥{format_cents(report.gross_profit)}，"
        f"毛利率 {format_percent(report.gross_margin)}。"
    )

    existing = await db.execute(
        select(ReportSnapshot)
        .where(
            ReportSnapshot.project_id == project_id,
            ReportSnapshot.user_id == current_user.id,
            ReportSnapshot.summary == summary,
        )
        .order_by(ReportSnapshot.version.desc())
    )
    latest = existing.scalars().first()

    if latest:
        return latest

    version_result = await db.execute(
        select(ReportSnapshot)
        .where(
            ReportSnapshot.project_id == project_id,
            ReportSnapshot.user_id == current_user.id,
        )
        .order_by(ReportSnapshot.version.desc())
    )
    latest_any = version_result.scalars().first()
    next_version = (latest_any.version + 1) if latest_any else 1

    snapshot = ReportSnapshot(
        project_id=project_id,
        user_id=current_user.id,
        version=next_version,
        summary=summary,
        detail_json=json.dumps(detail, ensure_ascii=False),
        status="generated",
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)

    return snapshot


@router.get("/projects/{project_id}/report/export")
async def export_report(
    project_id: str,
    fmt: str = "csv",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _verify_project_owner(project_id, current_user.id, db)

    records = await _get_project_records(project_id, current_user.id, db)
    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No records found for this project",
        )

    export_records = _records_to_export_records(records)
    report_input = _records_to_report_input(records)
    report = build_restaurant_poc_report(report_input)

    if fmt == "csv":
        csv_content = export_csv(export_records, project.name)
        return StreamingResponse(
            io.BytesIO(csv_content.encode("utf-8-sig")),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename=report_{project_id}.csv"
            },
        )

    if fmt == "excel":
        excel_bytes = export_excel(export_records, project.name, report)
        return StreamingResponse(
            io.BytesIO(excel_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=report_{project_id}.xlsx"
            },
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported export format: {fmt}. Use 'csv' or 'excel'.",
    )


@router.post("/projects/{project_id}/report/share", response_model=ShareResponse)
async def share_report(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_project_owner(project_id, current_user.id, db)

    latest_result = await db.execute(
        select(ReportSnapshot)
        .where(
            ReportSnapshot.project_id == project_id,
            ReportSnapshot.user_id == current_user.id,
        )
        .order_by(ReportSnapshot.version.desc())
    )
    latest = latest_result.scalars().first()
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No report generated yet. Please generate a report first.",
        )

    if latest.share_token:
        share_url = f"https://app.piaoxiaozhu.com/share/{latest.share_token}"
        return ShareResponse(share_token=latest.share_token, share_url=share_url)

    share_token = uuid.uuid4().hex
    latest.share_token = share_token
    await db.commit()

    share_url = f"https://app.piaoxiaozhu.com/share/{share_token}"
    return ShareResponse(share_token=share_token, share_url=share_url)


@router.get("/share/{share_token}")
async def get_shared_report(
    share_token: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ReportSnapshot).where(ReportSnapshot.share_token == share_token)
    )
    snapshot = result.scalar_one_or_none()
    if snapshot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    return {
        "id": str(snapshot.id),
        "project_id": str(snapshot.project_id),
        "version": snapshot.version,
        "summary": snapshot.summary,
        "detail": json.loads(snapshot.detail_json) if snapshot.detail_json else None,
        "status": snapshot.status,
        "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
    }
