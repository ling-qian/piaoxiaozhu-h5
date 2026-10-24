"""订阅到期的提醒扫描。

与 subscription.py 的分工：那边是**纯函数**的有效期判定（读路径上到处调用，
不碰 IO）；这边是**定时任务**的扫描与发送，只在 Celery 里跑。

提醒档位（天数按「还剩几天」向上取整，0.5 天算「还剩 1 天」）：
    8 天及以后  → 不提醒
    4–7 天      → d7
    2–3 天      → d3
    1 天        → d1
    已到期      → expired（仅在到期后 7 天内提醒一次，避免功能首次上线时
                  给半年前就到期、再没续费的老用户群发）

去重：同一轮订阅周期里每个档位只发一次，状态记在 users.plan_remind_stage。
续费后 plan_expires_at 前移，与 plan_remind_expires_at 不再相等，自动视为
新周期（档位清零），无需在支付回调里额外重置。
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.plan_config import DEFAULT_PLAN_CODE, get_plan
from app.services.subscription import days_until
from app.services.wx_subscribe import (
    STATUS_SENT,
    STATUS_SKIPPED,
    send_expiry_reminder,
)

logger = logging.getLogger(__name__)

STAGE_D7 = "d7"
STAGE_D3 = "d3"
STAGE_D1 = "d1"
STAGE_EXPIRED = "expired"

# 顺序即严重程度，用于判断本轮是否已经提醒过该档位（越大越紧急）
_STAGE_RANK = {STAGE_D7: 1, STAGE_D3: 2, STAGE_D1: 3, STAGE_EXPIRED: 4}

# 扫描窗口：只处理到期时间在「今天起 7 天内」的用户
SCAN_WINDOW_DAYS = 7
# 已到期用户的提醒窗口：超过这个天数就不再提醒
EXPIRED_REMIND_WINDOW_DAYS = 7

# 单次任务最多处理多少用户，避免首次上线时一次打爆微信接口限额
MAX_USERS_PER_RUN = 200


def reminder_stage_for(days: int) -> Optional[str]:
    """按剩余天数决定该发哪一档；不到提醒时机返回 None。"""
    if days >= SCAN_WINDOW_DAYS + 1:
        return None
    if days > 3:
        return STAGE_D7
    if days > 1:
        return STAGE_D3
    if days > 0:
        return STAGE_D1
    return STAGE_EXPIRED


def pending_stage(user: User, days: int) -> Optional[str]:
    """算出这个用户本次应该发的档位；已发过或不需要发则返回 None。"""
    target = reminder_stage_for(days)
    if target is None:
        return None

    # 到期时间与上次提醒时一致 → 同一周期，沿用已发档位；不一致 → 续过费，清零重来
    same_cycle = (
        user.plan_remind_expires_at is not None
        and user.plan_expires_at is not None
        and user.plan_remind_expires_at == user.plan_expires_at
    )
    sent_rank = _STAGE_RANK.get(user.plan_remind_stage or "", 0) if same_cycle else 0

    if _STAGE_RANK[target] <= sent_rank:
        return None
    return target


async def _candidates(db: AsyncSession, now: datetime) -> list[User]:
    """找出需要提醒的用户。

    只查付费套餐：free 不会到期，也就没有续费一说。
    plan_expires_at 为 NULL 的历史付费数据同样跳过——没有到期时间就无从判断
    「快到期了」，见 services/subscription.py 的说明。
    """
    window_end = now + timedelta(days=SCAN_WINDOW_DAYS + 1)
    window_start = now - timedelta(days=EXPIRED_REMIND_WINDOW_DAYS)

    query = (
        select(User)
        .where(
            User.plan_code != DEFAULT_PLAN_CODE,
            User.plan_expires_at.is_not(None),
            User.plan_expires_at <= window_end,
            User.plan_expires_at >= window_start,
        )
        .order_by(User.plan_expires_at.asc())
        .limit(MAX_USERS_PER_RUN)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def run_expiry_reminders(
    db: AsyncSession, now: Optional[datetime] = None
) -> dict:
    """扫描并发送到期提醒，返回统计。供 Celery 任务调用（调用方负责 dispose engine）。"""
    moment = now or datetime.now(timezone.utc)

    users = await _candidates(db, moment)
    counters = {"scanned": len(users), "sent": 0, "skipped": 0, "failed": 0}

    for user in users:
        expires_at = user.plan_expires_at
        if expires_at is None:  # 查询已过滤，仅为类型收窄
            continue

        days = days_until(expires_at, moment)
        if days is None:
            continue
        stage = pending_stage(user, days)
        if stage is None:
            continue

        plan = get_plan(user.plan_code)
        status = await send_expiry_reminder(
            user.openid,
            plan_name=plan.name,
            expires_at=expires_at,
            days_left=days,
        )

        if status == STATUS_SENT:
            counters["sent"] += 1
        elif status == STATUS_SKIPPED:
            counters["skipped"] += 1
        else:
            counters["failed"] += 1

        # 只有**真正送达**才锁定档位。未送达（未配置模板 / 用户尚未授权 / 发送失败）
        # 一律不记录，下次任务会重试：
        # - 模板 id 是后补的，若提前锁定档位，上线配置后这批用户会被永久跳过；
        # - 用户可能在小程序里稍后才点授权，重试才能把消息补发出去。
        # 一档只发一次的上限由「送达后锁定档位」保证，不会变成每日重复打扰。
        if status == STATUS_SENT:
            user.plan_remind_stage = stage
            user.plan_remind_expires_at = expires_at
            user.plan_remind_sent_at = moment
        else:
            logger.info(
                "到期提醒未送达，保留档位待下次重试: user=%s stage=%s status=%s",
                user.id,
                stage,
                status,
            )

    await db.commit()
    logger.info("到期提醒任务完成: %s", counters)
    return counters
