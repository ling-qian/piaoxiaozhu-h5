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

    if not plans:
        return {
            "items": [
                {
                    "code": "free",
                    "name": "免费版",
                    "quota": 10,
                    "price_cents": 0,
                    "features": "每月10张发票,基础报表,基础分类",
                },
                {
                    "code": "basic",
                    "name": "基础版",
                    "quota": 500,
                    "price_cents": 2900,
                    "features": "每月500张发票,高级报表,智能分类",
                },
                {
                    "code": "pro",
                    "name": "专业版",
                    "quota": 3000,
                    "price_cents": 9900,
                    "features": "每月3000张发票,高级报表,智能分类,异常检测,导出PDF",
                },
                {
                    "code": "toolkit",
                    "name": "工具包",
                    "quota": 0,
                    "price_cents": 4900,
                    "features": "税收政策速查,发票操作指南,财税计算工具",
                },
            ]
        }

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

    return {
        "plan_code": current_user.plan_code,
        "quota_total": current_user.quota_total,
        "quota_used": current_user.quota_used,
        "quota_remaining": remaining,
    }
