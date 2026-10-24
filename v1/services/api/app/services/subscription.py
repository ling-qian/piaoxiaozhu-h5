"""套餐订阅周期：到期判定与续费顺延。

套餐本身（价格、限额、权益）的权威定义在 plan_config.py，本模块只负责
「这笔订阅此刻是否仍然有效」，不重复任何套餐常量。

有效期规则
----------
- free 永远有效，不参与到期判定。
- 付费套餐以 users.plan_expires_at 为准，早于该时刻即失效。
- plan_expires_at 为 NULL 表示「没有订阅周期」，只会出现在按月续费上线之前
  已付费的历史数据上。为了不误伤这些老用户，此时仍按原套餐生效；上线之后
  的每一次支付都会写入明确的到期时间，因此新数据不存在这种情况。

到期采用惰性判定而不是定时任务：读的时候按当前时间算一次，过期即按 free
计。这样不依赖 Celery/Redis 是否在线，也不会出现「定时任务挂了两天，用户
白嫖两天」或者「任务多跑一次，用户被提前降级」这类与调度状态耦合的问题。
"""

import calendar
import math
from datetime import datetime, timezone
from typing import Optional

from app.services.plan_config import DEFAULT_PLAN_CODE

# 一次续费覆盖的月数。当前所有付费套餐均按月售卖，若将来加年付套餐，
# 应改为由订单（orders.period_months）携带，而不是在这里加分支。
DEFAULT_PERIOD_MONTHS = 1


def add_months(moment: datetime, months: int) -> datetime:
    """在 moment 上叠加自然月数。

    日期溢出收敛到目标月最后一天：1/31 加一个月得 2/28（闰年 2/29），
    否则 datetime.replace 会直接抛 ValueError。
    """
    total = moment.month - 1 + months
    year = moment.year + total // 12
    month = total % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


def is_plan_active(
    plan_code: Optional[str],
    expires_at: Optional[datetime],
    now: Optional[datetime] = None,
) -> bool:
    """付费套餐此刻是否生效（free 不视为「付费生效」）"""
    if not plan_code or plan_code == DEFAULT_PLAN_CODE:
        return False
    if expires_at is None:
        return True
    return expires_at > (now or datetime.now(timezone.utc))


def effective_plan_code(
    plan_code: Optional[str],
    expires_at: Optional[datetime],
    now: Optional[datetime] = None,
) -> str:
    """按到期时间推导当前有效套餐编码。

    权益校验必须走这个函数而不是直接读 users.plan_code：库里存的是「买过
    什么」，有效套餐才是「现在能用什么」，两者在到期后会不一致。
    """
    if is_plan_active(plan_code, expires_at, now):
        return plan_code  # type: ignore[return-value]
    return DEFAULT_PLAN_CODE


def renewal_expiry(
    expires_at: Optional[datetime],
    months: int = DEFAULT_PERIOD_MONTHS,
    now: Optional[datetime] = None,
) -> datetime:
    """续费后的新到期时间。

    未到期续费在原有到期时间上顺延，避免用户提前续费反而损失剩余时长；
    已到期或首次订阅则从当前时刻起算。
    """
    current = now or datetime.now(timezone.utc)
    base = expires_at if (expires_at is not None and expires_at > current) else current
    return add_months(base, months)


def days_until(
    expires_at: Optional[datetime], now: Optional[datetime] = None
) -> Optional[int]:
    """距离到期还有多少天，向上取整（不足一天按「还剩 1 天」算）。

    过期返回负数。plan_expires_at 为 NULL（无订阅周期）时返回 None——没有
    到期时间就谈不上「还剩几天」。前端展示与到期提醒共用这一处口径。
    """
    if expires_at is None:
        return None
    seconds = (expires_at - (now or datetime.now(timezone.utc))).total_seconds()
    return math.ceil(seconds / 86400)
