from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceRecord
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectListResponse

router = APIRouter(prefix="/api", tags=["projects"])


async def _build_project_response(project: Project, db: AsyncSession) -> ProjectResponse:
    rec_count_result = await db.execute(
        select(func.count()).select_from(InvoiceRecord).where(
            InvoiceRecord.project_id == project.id
        )
    )
    record_count = rec_count_result.scalar() or 0

    cost_result = await db.execute(
        select(func.coalesce(func.sum(InvoiceRecord.amount), 0)).where(
            InvoiceRecord.project_id == project.id,
            InvoiceRecord.direction == "out",
        )
    )
    total_cost = float(cost_result.scalar() or 0)

    income_result = await db.execute(
        select(func.coalesce(func.sum(InvoiceRecord.amount), 0)).where(
            InvoiceRecord.project_id == project.id,
            InvoiceRecord.direction == "income",
        )
    )
    total_income = float(income_result.scalar() or 0)

    return ProjectResponse(
        id=project.id,
        user_id=project.user_id,
        customer_id=project.customer_id,
        name=project.name,
        industry=project.industry,
        report_month=project.report_month,
        status=project.status,
        created_at=project.created_at,
        record_count=record_count,
        total_cost=total_cost,
        total_income=total_income,
    )


@router.get("/projects", response_model=ProjectListResponse)
async def list_projects(
    page: int = 1,
    size: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size
    count_result = await db.execute(
        select(func.count()).select_from(Project).where(Project.user_id == current_user.id)
    )
    total = count_result.scalar() or 0

    result = await db.execute(
        select(Project)
        .where(Project.user_id == current_user.id)
        .order_by(Project.created_at.desc())
        .offset(offset)
        .limit(size)
    )
    projects = result.scalars().all()

    items = []
    for p in projects:
        resp = await _build_project_response(p, db)
        items.append(resp)

    return ProjectListResponse(items=items, total=total)


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(
        user_id=current_user.id,
        customer_id=body.customer_id,
        name=body.name,
        industry=body.industry,
        report_month=body.report_month,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return await _build_project_response(project, db)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return await _build_project_response(project, db)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    allowed_fields = {"name", "industry", "report_month", "status", "customer_id"}
    for field, value in body.items():
        if field in allowed_fields and value is not None:
            setattr(project, field, value)

    await db.commit()
    await db.refresh(project)
    return await _build_project_response(project, db)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    await db.delete(project)
    await db.commit()


@router.get("/projects/{project_id}/stats")
async def get_project_stats(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    total_records = await db.execute(
        select(func.count()).select_from(InvoiceRecord).where(
            InvoiceRecord.project_id == project_id
        )
    )
    cost_result = await db.execute(
        select(func.coalesce(func.sum(InvoiceRecord.amount), 0)).where(
            InvoiceRecord.project_id == project_id,
            InvoiceRecord.direction == "out",
        )
    )
    income_result = await db.execute(
        select(func.coalesce(func.sum(InvoiceRecord.amount), 0)).where(
            InvoiceRecord.project_id == project_id,
            InvoiceRecord.direction == "income",
        )
    )
    category_result = await db.execute(
        select(InvoiceRecord.category_l1, func.sum(InvoiceRecord.amount))
        .where(
            InvoiceRecord.project_id == project_id,
            InvoiceRecord.direction == "out",
        )
        .group_by(InvoiceRecord.category_l1)
    )

    total_cost = float(cost_result.scalar() or 0)
    total_income = float(income_result.scalar() or 0)
    gross_profit = total_income - total_cost
    gross_margin = (gross_profit / total_income * 100) if total_income > 0 else 0.0

    cost_by_category = {}
    for cat_l1, amount in category_result.all():
        cost_by_category[cat_l1 or "未分类"] = float(amount)

    return {
        "project_id": project_id,
        "project_name": project.name,
        "total_records": total_records.scalar() or 0,
        "total_cost": total_cost,
        "total_income": total_income,
        "gross_profit": gross_profit,
        "gross_margin": round(gross_margin, 2),
        "cost_by_category": cost_by_category,
    }
