from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceRecord
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectListResponse

router = APIRouter(prefix="/api", tags=["projects"])


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
        rec_count_result = await db.execute(
            select(func.count()).select_from(InvoiceRecord).where(
                InvoiceRecord.project_id == p.id
            )
        )
        record_count = rec_count_result.scalar() or 0

        cost_result = await db.execute(
            select(func.coalesce(func.sum(InvoiceRecord.amount), 0)).where(
                InvoiceRecord.project_id == p.id,
                InvoiceRecord.direction == "out",
            )
        )
        total_cost = float(cost_result.scalar() or 0)

        items.append(
            ProjectResponse(
                id=p.id,
                user_id=p.user_id,
                customer_id=p.customer_id,
                name=p.name,
                industry=p.industry,
                report_month=p.report_month,
                status=p.status,
                created_at=p.created_at,
                record_count=record_count,
                total_cost=total_cost,
            )
        )

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
    return ProjectResponse(
        id=project.id,
        user_id=project.user_id,
        customer_id=project.customer_id,
        name=project.name,
        industry=project.industry,
        report_month=project.report_month,
        status=project.status,
        created_at=project.created_at,
        record_count=0,
        total_cost=0.0,
    )


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
