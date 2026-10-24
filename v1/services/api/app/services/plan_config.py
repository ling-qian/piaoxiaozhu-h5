"""套餐配置 —— v1（小程序后端）的套餐权威定义。

套餐编码、价格、发票与项目限额必须与 H5 端 piaoxiaozhu-h5/lib/plan-config.ts
保持一致，改动时两端需同步。权益说明（features）只需列本端真正提供的能力。

限额统一用 -1 表示无限。
"""

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

UNLIMITED = -1

DEFAULT_PLAN_CODE = "free"


@dataclass(frozen=True)
class PlanConfig:
    code: str
    name: str
    desc: str
    price_cents: int
    invoice_limit: int  # 每月发票识别次数，-1 无限（积分制下仅作展示参考）
    project_limit: int  # 项目数量上限，-1 无限
    can_export: bool
    features: Tuple[str, ...]  # 前端展示用的权益列表
    # 每个「月」发放的积分。购买多周期时按倍数放大（折扣只减价格，不克扣额度）。
    points_grant: int = 0


@dataclass(frozen=True)
class PeriodOption:
    """可购买的计费周期。折扣只作用于价格，不影响发放的积分数。"""

    months: int
    label: str
    discount: float  # 1.0 = 原价，0.9 = 9 折


PERIOD_OPTIONS: Tuple[PeriodOption, ...] = (
    PeriodOption(months=1, label="1 个月", discount=1.0),
    PeriodOption(months=3, label="3 个月", discount=0.9),
    PeriodOption(months=12, label="12 个月", discount=0.8),
)


def get_period(months: int) -> Optional[PeriodOption]:
    for p in PERIOD_OPTIONS:
        if p.months == months:
            return p
    return None


def period_price_cents(plan: PlanConfig, months: int) -> int:
    """该周期的应付金额（分）。未支持的周期回退到按月原价，避免算错钱。"""
    option = get_period(months)
    if option is None:
        return plan.price_cents * months
    return int(round(plan.price_cents * months * option.discount))


def period_points(plan: PlanConfig, months: int) -> int:
    """该周期发放的积分。折扣不克扣额度，所以按整月倍数给。"""
    return plan.points_grant * months


PLANS: Dict[str, PlanConfig] = {
    "free": PlanConfig(
        code="free",
        name="免费版",
        desc="适合个人体验记账",
        price_cents=0,
        invoice_limit=5,
        project_limit=1,
        can_export=False,
        features=("注册送 30 积分", "每日签到 +2 积分", "1个项目", "基础报表"),
        points_grant=0,  # 免费版不按月发放，靠注册赠送(30)与签到(+2/天)
    ),
    "pro": PlanConfig(
        code="pro",
        name="专业版",
        desc="适合中小商户经营分析",
        price_cents=2900,
        invoice_limit=200,
        project_limit=10,
        can_export=True,
        features=("每月300积分", "10个项目", "数据导出"),
        points_grant=300,
    ),
    "enterprise": PlanConfig(
        code="enterprise",
        name="企业版",
        desc="适合连锁门店深度分析",
        price_cents=9900,
        invoice_limit=UNLIMITED,
        project_limit=UNLIMITED,
        can_export=True,
        features=(
            "每月1200积分",
            "无限项目",
            "数据导出",
        ),
        points_grant=1200,
    ),
}


def get_plan(plan_code: Optional[str]) -> PlanConfig:
    """取套餐配置，未知编码回退到免费版"""
    return PLANS.get(plan_code or DEFAULT_PLAN_CODE, PLANS[DEFAULT_PLAN_CODE])


def check_invoice_limit(plan_code: Optional[str], used_this_month: int) -> Tuple[bool, int, int]:
    """发票识别额度检查，返回 (是否可用, 限额, 已用)"""
    limit = get_plan(plan_code).invoice_limit
    return (limit == UNLIMITED or used_this_month < limit, limit, used_this_month)


def check_project_limit(plan_code: Optional[str], current_count: int) -> Tuple[bool, int, int]:
    """项目数量检查，返回 (是否可用, 限额, 当前数量)"""
    limit = get_plan(plan_code).project_limit
    return (limit == UNLIMITED or current_count < limit, limit, current_count)


def can_export(plan_code: Optional[str]) -> bool:
    return get_plan(plan_code).can_export


def limit_label(limit: int) -> str:
    """限额的展示文案"""
    return "无限" if limit == UNLIMITED else str(limit)
