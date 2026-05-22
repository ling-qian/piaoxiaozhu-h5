import io
import json
import uuid
from datetime import date

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
    project_id: str, user_id, db: AsyncSession
) -> list[InvoiceRecord]:
    result = await db.execute(
        select(InvoiceRecord).where(
            InvoiceRecord.project_id == project_id,
            InvoiceRecord.user_id == user_id,
        )
    )
    return result.scalars().all()


def _records_to_report_input(records: list[InvoiceRecord]) -> list:
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


def _records_to_export_records(records: list[InvoiceRecord]) -> list[ExportRecord]:
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


@router.get("/projects/{project_id}/report", response_model=ReportResponse)
async def get_report(
    project_id: str,
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

    records = await _get_project_records(project_id, current_user.id, db)
    report_input = _records_to_report_input(records)
    report = build_restaurant_poc_report(report_input)

    detail = {
        "total_income": report.total_income,
        "total_cost": report.total_cost,
        "gross_profit": report.gross_profit,
        "gross_margin": report.gross_margin,
        "cost_by_category": [
            {
                "category_code": c.category_code,
                "name": c.name,
                "amount": c.amount,
            }
            for c in report.cost_by_category
        ],
    }

    summary = (
        f"本月总收入 ¥{format_cents(report.total_income)}，"
        f"总成本 ¥{format_cents(report.total_cost)}，"
        f"毛利润 ¥{format_cents(report.gross_profit)}，"
        f"毛利率 {format_percent(report.gross_margin)}。"
    )

    existing = await db.execute(
        select(ReportSnapshot)
        .where(
            ReportSnapshot.project_id == project_id,
            ReportSnapshot.user_id == current_user.id,
        )
        .order_by(ReportSnapshot.version.desc())
    )
    latest = existing.scalars().first()
    next_version = (latest.version + 1) if latest else 1

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

    records = await _get_project_records(project_id, current_user.id, db)
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
