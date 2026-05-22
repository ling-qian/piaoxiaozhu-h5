from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


CATEGORY_NAMES: dict[str, str] = {
    "food_material": "食材",
    "rent": "房租",
    "salary": "工资",
    "utilities": "水电",
    "platform_fee": "平台佣金",
    "advertising": "广告",
    "office": "办公",
    "other": "其他",
}


@dataclass(frozen=True)
class CategorySummary:
    category_code: str
    name: str
    amount: int


@dataclass(frozen=True)
class RestaurantPocReport:
    total_income: int
    total_cost: int
    gross_profit: int
    gross_margin: float
    cost_by_category: list[CategorySummary] = field(default_factory=list)


@dataclass
class _ReportRecord:
    type: Optional[str] = None
    total: Optional[int] = None
    category_code: Optional[str] = None


def build_restaurant_poc_report(records: list[_ReportRecord]) -> RestaurantPocReport:
    total_income = 0
    total_cost = 0
    cost_by_category_map: dict[str, int] = {}

    for rec in records:
        amount = rec.total if rec.total is not None else 0
        if rec.type == "income":
            total_income += amount
        else:
            total_cost += amount
            code = rec.category_code or "other"
            cost_by_category_map[code] = cost_by_category_map.get(code, 0) + amount

    gross_profit = total_income - total_cost
    gross_margin = gross_profit / total_income if total_income > 0 else 0.0

    cost_by_category = sorted(
        [
            CategorySummary(
                category_code=code,
                name=CATEGORY_NAMES.get(code, code),
                amount=amount,
            )
            for code, amount in cost_by_category_map.items()
        ],
        key=lambda s: s.amount,
        reverse=True,
    )

    return RestaurantPocReport(
        total_income=total_income,
        total_cost=total_cost,
        gross_profit=gross_profit,
        gross_margin=gross_margin,
        cost_by_category=cost_by_category,
    )


def format_cents(cents: int) -> str:
    return f"{cents / 100:.2f}"


def format_percent(ratio: float) -> str:
    return f"{ratio * 100:.1f}%"
