from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.plan import Plan
from app.models.user import User

router = APIRouter(prefix="/api", tags=["plans"])


@router.get("/plans")
async def list_plans(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Plan).where(Plan.is_active == True).order_by(Plan.price_cents)
    )
    plans = result.scalars().all()

    return {
        "items": [
            {
                "code": p.code,
                "name": p.name,
                "quota": p.quota,
                "price_cents": p.price_cents,
                "features": p.features,
            }
            for p in plans
        ]
    }


@router.get("/me/quota")
async def get_my_quota(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    remaining = current_user.quota_total - current_user.quota_used
    if remaining < 0:
        remaining = 0

    plan_result = await db.execute(select(Plan).where(Plan.code == current_user.plan_code))
    plan = plan_result.scalar_one_or_none()

    return {
        "plan_code": current_user.plan_code,
        "plan_name": plan.name if plan else current_user.plan_code,
        "quota_total": current_user.quota_total,
        "quota_used": current_user.quota_used,
        "quota_remaining": remaining,
    }
