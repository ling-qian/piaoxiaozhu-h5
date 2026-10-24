"""积分相关接口：查余额/流水、每日签到。"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.plan import QuotaLog
from app.models.user import User
from app.services import points as points_svc

router = APIRouter(prefix="/api/points", tags=["points"])

logger = logging.getLogger(__name__)


@router.get("")
async def get_points(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """余额 + 今日签到状态 + 当前消耗单价（前端据此展示，避免两边写死）。"""
    balance = await points_svc.get_balance(db, current_user.id)
    checked = await points_svc.checked_in_today(db, current_user.id)
    return {
        "balance": balance,
        "checked_in_today": checked,
        "checkin_reward": points_svc.DAILY_CHECKIN_REWARD,
        "signup_bonus": points_svc.SIGNUP_BONUS,
        "costs": {
            "invoice_ocr": points_svc.COST_INVOICE_OCR,
            "ai_analysis": points_svc.COST_AI_ANALYSIS,
        },
    }


@router.post("/checkin")
async def checkin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """每日签到。同一天重复调用返回 400，不会重复发放。"""
    try:
        balance = await points_svc.daily_checkin(db, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return {
        "balance": balance,
        "earned": points_svc.DAILY_CHECKIN_REWARD,
        "message": f"签到成功，+{points_svc.DAILY_CHECKIN_REWARD} 积分",
    }


@router.get("/checkin/calendar")
async def get_checkin_calendar(
    month: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """签到日历：指定月份（默认本月）的签到日期、连续天数、本月天数、余额。

    month 形如 2026-10；非法格式返回 400。
    """
    try:
        data = await points_svc.checkin_calendar(db, current_user.id, month)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return data


@router.get("/packages")
async def list_packages():
    """可购买的积分包。与套餐的区别：只发积分，不改变套餐与到期时间。

    价格刻意高于套餐内单价（套餐是批发价），详见 services/points.py 的注释。
    """
    return {
        "items": [
            {
                "code": p.code,
                "label": p.label,
                "points": p.points,
                "price_cents": p.price_cents,
                "unit_price_yuan": round(p.unit_price_yuan, 3),
            }
            for p in points_svc.POINT_PACKAGES.values()
        ]
    }


@router.get("/logs")
async def list_logs(
    limit: int = Query(30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """积分流水（最近的在前），用于「积分明细」页与客服对账。"""
    result = await db.execute(
        select(QuotaLog)
        .where(QuotaLog.user_id == current_user.id)
        .order_by(QuotaLog.created_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    return {
        "items": [
            {
                "action": r.action,
                "delta": r.delta,
                "reason": r.reason,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in logs
        ]
    }
