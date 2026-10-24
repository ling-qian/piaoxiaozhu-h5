from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_current_user, get_db
from app.models.user import User
from app.services.plan_config import (
    PERIOD_OPTIONS,
    PLANS,
    get_plan,
    period_points,
    period_price_cents,
)
from app.services.subscription import days_until, effective_plan_code

router = APIRouter(prefix="/api", tags=["plans"])


@router.get("/plans")
async def list_plans():
    """套餐列表。直接从 plan_config 读取，避免与套餐权威定义产生偏差。

    计量单位是**积分**：`points_per_month` 为每月发放额度，`periods` 为
    可购买的周期（包月/包季/包年）及其折后价与发放积分。
    """
    ordered = sorted(PLANS.values(), key=lambda p: p.price_cents)
    return {
        "items": [
            {
                "code": p.code,
                "name": p.name,
                "desc": p.desc,
                "price_cents": p.price_cents,
                "points_per_month": p.points_grant,
                "project_limit": p.project_limit,
                "can_export": p.can_export,
                # 小程序端按数组渲染，这里必须返回列表
                "features": list(p.features),
                "periods": [
                    {
                        "months": opt.months,
                        "label": opt.label,
                        "discount": opt.discount,
                        "price_cents": period_price_cents(p, opt.months),
                        "points": period_points(p, opt.months),
                    }
                    for opt in PERIOD_OPTIONS
                ],
            }
            for p in ordered
        ]
    }


@router.get("/me/quota")
async def get_my_quota(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """当前用户的套餐与积分状况。

    ⚠️ 计量口径已从「每月发票张数」切换为**积分**：本接口不再返回
    quota_total / quota_used / quota_remaining，改为 points_* 字段。
    前端不应再自己算「还剩几张票」，一切以积分为准。
    """
    effective_code = effective_plan_code(
        current_user.plan_code, current_user.plan_expires_at
    )
    plan = get_plan(effective_code)

    from app.services import points as points_svc

    balance = await points_svc.get_balance(db, current_user.id)
    used_points = await points_svc.used_this_month(db, current_user.id)

    # 到期提醒：小程序端要用 tmplIds 调 wx.requestSubscribeMessage 才能收到
    # 订阅消息，所以模板 id 必须下发给前端（模板 id 本身不是敏感信息）。
    # 未配置模板时 template_id 为 None，前端据此不展示「开启提醒」入口。
    remaining_days = days_until(current_user.plan_expires_at)

    return {
        "plan_code": plan.code,
        "plan_name": plan.name,
        # ---- 积分口径（取代原来的 quota_* 字段）----
        "points_balance": balance,
        "points_used_this_month": used_points,
        "points_per_month": plan.points_grant,
        "points_cost_ocr": points_svc.COST_INVOICE_OCR,
        "points_cost_ai": points_svc.COST_AI_ANALYSIS,
        # 数据导出是付费权益，前端据此决定是否展示导出入口
        "can_export": plan.can_export,
        # 订阅有效期：前端据此展示到期日与「续费」入口
        "plan_expires_at": current_user.plan_expires_at,
        # 距离到期还有多少天（向上取整，已过期为负数）。NULL 表示无订阅周期。
        "plan_days_left": remaining_days,
        "plan_expired": current_user.plan_code != plan.code,
        # 库里记录的套餐（购买历史）。到期后有效套餐已回落到 free，
        # 但仍需要它来区分「续费原套餐」和「升级到其他套餐」。
        "purchased_plan_code": current_user.plan_code,
        # 到期提醒的订阅消息模板 id；未配置则为 None
        "subscribe_template_id": settings.WX_SUBSCRIBE_TEMPLATE_EXPIRE,
        # 当前是否处于「可以/值得提醒续费」的状态，省得前端自己拼上面三个条件
        "can_remind_renewal": bool(
            settings.WX_SUBSCRIBE_TEMPLATE_EXPIRE
            and remaining_days is not None
            and remaining_days <= 7
        ),
    }
