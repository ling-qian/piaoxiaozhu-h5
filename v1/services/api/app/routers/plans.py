from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.user import User

router = APIRouter(prefix="/api", tags=["plans"])

PLANS = [
    {
        "code": "free",
        "name": "免费版",
        "quota": 10,
        "price_cents": 0,
        "features": "每月10张发票,基础报表,基础分类",
    },
    {
        "code": "pro",
        "name": "专业版",
        "quota": 200,
        "price_cents": 9900,
        "features": "每月200张发票,高级报表,智能分类,异常检测,导出PDF",
    },
    {
        "code": "enterprise",
        "name": "企业版",
        "quota": -1,
        "price_cents": 29900,
        "features": "无限发票,全部功能,专属客服,API接入,自定义分类规则",
    },
]


@router.get("/plans")
async def list_plans():
    return {"items": PLANS}


@router.get("/me/quota")
async def get_my_quota(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return {
        "plan_code": current_user.plan_code,
        "quota_total": current_user.quota_total,
        "quota_used": current_user.quota_used,
        "quota_remaining": current_user.quota_total - current_user.quota_used,
    }
