"""积分体系：发放、消耗、余额。

设计取舍
--------
1. **不新增「余额」字段**，余额 = `SUM(quota_logs.delta)`。
   理由：余额字段与流水双写必然出现不一致（写流水成功、更新余额失败，或反之），
   而对账口径只有流水是权威的。单用户流水量很小（每天签到 1 条 + 每次消耗 1 条），
   SUM 查询代价可接受；真到瓶颈再加余额快照表也不迟。
2. **并发安全**：扣减时先 `SELECT ... FOR UPDATE` 锁住用户行，再算余额、再写流水。
   否则两个请求同时读到「够」，会双花。
3. **消耗单价集中在本模块**，不散落到各路由里，调价只改一处。
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plan import QuotaLog
from app.models.user import User

logger = logging.getLogger(__name__)

# ---- 发放规则 ----
SIGNUP_BONUS = 30          # 注册赠送：够 30 张票或 3 次 AI 分析
DAILY_CHECKIN_REWARD = 2   # 每日签到

# ---- 消耗单价（调价只改这里）----
COST_INVOICE_OCR = 1       # 每张票据识别
COST_AI_ANALYSIS = 10      # 每次 AI 经营分析
COST_AI_ASK = 1            # 超过每日免费额度后，每次问账扣 1 分
DAILY_FREE_ASKS = 5        # 每天免费问账次数

# action 常量：写进流水后就是审计依据，不要随意改名（历史数据会失去语义）
ACTION_SIGNUP = "signup_bonus"
ACTION_CHECKIN = "daily_checkin"
ACTION_PURCHASE = "purchase_grant"
ACTION_CONSUME_OCR = "consume_invoice_ocr"
ACTION_CONSUME_AI = "consume_ai_analysis"
ACTION_ASK = "ai_ask"      # 问账（免费与付费共用，delta=0 表示免费那几次）


@dataclass(frozen=True)
class PointPackage:
    """单独售卖的积分包。"""

    code: str
    label: str
    points: int
    price_cents: int

    @property
    def unit_price_yuan(self) -> float:
        return (self.price_cents / 100) / self.points


# 定价原则：积分包单价**高于**套餐内单价（pro 为 ¥29/300 分 ≈ ¥0.097/分），
# 否则「买套餐」永远不如「买积分」，套餐就卖不动了。套餐的溢价换的是项目数与导出。
POINT_PACKAGES: Dict[str, PointPackage] = {
    "points_100": PointPackage("points_100", "100 积分", 100, 1200),    # ¥0.120/分
    "points_500": PointPackage("points_500", "500 积分", 500, 5500),    # ¥0.110/分
    "points_1200": PointPackage("points_1200", "1200 积分", 1200, 12600),  # ¥0.105/分
}


def is_point_package(code: str) -> bool:
    return code in POINT_PACKAGES


class InsufficientPoints(Exception):
    """积分不足。带余额与所需数量，便于路由层给出可操作提示。"""

    def __init__(self, required: int, balance: int) -> None:
        self.required = required
        self.balance = balance
        super().__init__(f"积分不足：需要 {required}，当前 {balance}")


async def get_balance(db: AsyncSession, user_id: uuid.UUID) -> int:
    """当前余额。无流水时返回 0。"""
    result = await db.execute(
        select(func.coalesce(func.sum(QuotaLog.delta), 0)).where(QuotaLog.user_id == user_id)
    )
    return int(result.scalar() or 0)


async def grant(
    db: AsyncSession,
    user_id: uuid.UUID,
    amount: int,
    action: str,
    reason: Optional[str] = None,
    commit: bool = True,
) -> int:
    """发放积分，返回发放后余额。amount 必须为正。"""
    if amount <= 0:
        raise ValueError(f"发放积分必须为正数，收到 {amount}")

    db.add(QuotaLog(user_id=user_id, action=action, delta=amount, reason=reason))
    if commit:
        await db.commit()
    return await get_balance(db, user_id)


async def consume(
    db: AsyncSession,
    user_id: uuid.UUID,
    amount: int,
    action: str,
    reason: Optional[str] = None,
    commit: bool = True,
) -> int:
    """扣减积分，余额不足抛 InsufficientPoints。返回扣减后余额。

    加锁顺序：先锁 users 行 → 再算余额 → 再写流水，避免并发双花。
    """
    if amount <= 0:
        raise ValueError(f"扣减积分必须为正数，收到 {amount}")

    # 行锁：把同一用户的并发扣减串行化（SELECT FOR UPDATE）
    await db.execute(select(User.id).where(User.id == user_id).with_for_update())

    balance = await get_balance(db, user_id)
    if balance < amount:
        await db.rollback()
        raise InsufficientPoints(required=amount, balance=balance)

    db.add(
        QuotaLog(user_id=user_id, action=action, delta=-amount, reason=reason)
    )
    if commit:
        await db.commit()
    return balance - amount


async def used_this_month(db: AsyncSession, user_id: uuid.UUID) -> int:
    """本月已消耗的积分（正数）。

    口径：本月所有负向流水的绝对值之和。签到、赠送这些正向流水不计入。
    按 UTC 自然月切分，与签到的日界口径保持一致。
    """
    month_start = datetime.now(timezone.utc).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    result = await db.execute(
        select(func.coalesce(func.sum(QuotaLog.delta), 0)).where(
            QuotaLog.user_id == user_id,
            QuotaLog.delta < 0,
            QuotaLog.created_at >= month_start,
        )
    )
    total = int(result.scalar() or 0)
    return -total  # total 是负数，取绝对值


# 用户都在国内，签到必须按北京时间切日界。
# 用 UTC 日界（= 北京时间早 8 点重置）会让「早上 7 点签一次、9 点再签一次」重复领奖。
CN_TZ = timezone(timedelta(hours=8))


def _cn_day_start(now: Optional[datetime] = None) -> datetime:
    """北京时间「今天 00:00」对应的 UTC 时刻。"""
    local = (now or datetime.now(timezone.utc)).astimezone(CN_TZ)
    return local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


async def checkin_dates(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    """该用户全部已签到日期（北京时间，升序）。签到记录量很小，全量取即可。"""
    rows = await db.execute(
        select(QuotaLog.created_at).where(
            QuotaLog.user_id == user_id,
            QuotaLog.action == ACTION_CHECKIN,
        )
    )
    return sorted({r[0].astimezone(CN_TZ).strftime("%Y-%m-%d") for r in rows if r[0]})


def compute_streak(dates: set[str], today: str) -> int:
    """连续签到天数。今天还没签时，从昨天开始数（保留「进行中」的连续记录）。"""
    day = datetime.strptime(today, "%Y-%m-%d").date()
    if today not in dates:
        day = day - timedelta(days=1)
    streak = 0
    while day.isoformat() in dates:
        streak += 1
        day = day - timedelta(days=1)
    return streak


def _month_range(month: str) -> tuple[datetime, datetime]:
    """把 'YYYY-MM' 转成 [月初, 次月初) 的 UTC 区间（按北京时间切月）。"""
    year, mon = (int(x) for x in month.split("-"))
    if not 1 <= mon <= 12:
        raise ValueError("month 格式应为 YYYY-MM")
    start = datetime(year, mon, 1, tzinfo=CN_TZ)
    if mon == 12:
        end = datetime(year + 1, 1, 1, tzinfo=CN_TZ)
    else:
        end = datetime(year, mon + 1, 1, tzinfo=CN_TZ)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


async def checkin_calendar(
    db: AsyncSession, user_id: uuid.UUID, month: Optional[str] = None
) -> dict:
    """签到日历数据：指定月份的签到日期、连续天数、本月天数、余额。"""
    today = datetime.now(CN_TZ).strftime("%Y-%m-%d")
    all_dates = set(await checkin_dates(db, user_id))

    target = month or today[:7]
    try:
        start, end = _month_range(target)
    except ValueError as e:
        raise ValueError(str(e)) from e

    # 只保留目标月份内的日期（字符串前缀匹配即可，格式统一为 YYYY-MM-DD）
    month_dates = sorted(d for d in all_dates if d.startswith(target))

    return {
        "month": target,
        "today": today,
        "checked_dates": month_dates,
        "today_checked_in": today in all_dates,
        "month_count": len(month_dates),
        "streak": compute_streak(all_dates, today),
        "balance": await get_balance(db, user_id),
        "reward": DAILY_CHECKIN_REWARD,
    }


async def checked_in_today(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """今天是否已签到（按北京时间自然日）。"""
    result = await db.execute(
        select(func.count())
        .select_from(QuotaLog)
        .where(
            QuotaLog.user_id == user_id,
            QuotaLog.action == ACTION_CHECKIN,
            QuotaLog.created_at >= _cn_day_start(),
        )
    )
    return int(result.scalar() or 0) > 0


async def daily_checkin(
    db: AsyncSession, user_id: uuid.UUID, reward: int = DAILY_CHECKIN_REWARD
) -> int:
    """签到并发积分。已签到抛 ValueError（由路由转成 400）。返回新余额。"""
    if await checked_in_today(db, user_id):
        raise ValueError("今天已经签过到了，明天再来")
    return await grant(
        db, user_id, reward, ACTION_CHECKIN, "每日签到", commit=True
    )


async def grant_signup_bonus(db: AsyncSession, user_id: uuid.UUID) -> None:
    """新用户注册赠送。幂等：已有 signup 流水就不再发。"""
    exists = await db.execute(
        select(func.count())
        .select_from(QuotaLog)
        .where(QuotaLog.user_id == user_id, QuotaLog.action == ACTION_SIGNUP)
    )
    if int(exists.scalar() or 0) > 0:
        return
    await grant(db, user_id, SIGNUP_BONUS, ACTION_SIGNUP, "新用户注册赠送", commit=False)
    logger.info("用户 %s 获得注册赠送 %s 积分", user_id, SIGNUP_BONUS)


# --------------------------------------------------------------------------- 问账额度

async def asks_today(db: AsyncSession, user_id: uuid.UUID) -> int:
    """今日已问账次数（免费与付费都计入）。按北京时间自然日。"""
    result = await db.execute(
        select(func.count())
        .select_from(QuotaLog)
        .where(
            QuotaLog.user_id == user_id,
            QuotaLog.action == ACTION_ASK,
            QuotaLog.created_at >= _cn_day_start(),
        )
    )
    return int(result.scalar() or 0)


async def charge_ask(
    db: AsyncSession, user_id: uuid.UUID, question: str
) -> tuple[bool, int]:
    """问账计费。返回 (是否扣了积分, 今日剩余免费次数)。

    前 DAILY_FREE_ASKS 次免费；超出后每次扣 COST_AI_ASK。

    **免费次数在「成功之后」才记账**（见 record_free_ask）：额度判断只读不写，
    这样模型临时失败时不会白白消耗用户的免费次数——曾经先记账后解析，
    一次 503 就吃掉一次额度，用户会觉得「问了一句就少一次」。
    """
    used = await asks_today(db, user_id)

    if used < DAILY_FREE_ASKS:
        return False, DAILY_FREE_ASKS - used

    await consume(
        db,
        user_id,
        COST_AI_ASK,
        ACTION_ASK,
        f"问账：{question[:30]}",
    )
    return True, 0


async def record_free_ask(db: AsyncSession, user_id: uuid.UUID) -> None:
    """成功回答一次免费问账后记账（delta=0，不动余额，只用于计数）。"""
    used = await asks_today(db, user_id)
    db.add(
        QuotaLog(
            user_id=user_id,
            action=ACTION_ASK,
            delta=0,
            reason=f"免费问账（今日第 {used + 1}/{DAILY_FREE_ASKS} 次）",
        )
    )
    await db.commit()


async def refund_ask(db: AsyncSession, user_id: uuid.UUID) -> None:
    """问账失败时退回积分（只对已扣费的那次生效，由调用方判断）。"""
    await grant(db, user_id, COST_AI_ASK, ACTION_ASK, "问账失败退款")
