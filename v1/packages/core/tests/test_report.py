from piaoxiaozhu_core.report import (
    build_restaurant_poc_report,
    _ReportRecord,
    format_cents,
    format_percent,
    CATEGORY_NAMES,
)


def test_basic_report():
    records = [
        _ReportRecord(type="income", total=100000, category_code=None),
        _ReportRecord(type="expense", total=30000, category_code="food_material"),
        _ReportRecord(type="expense", total=10000, category_code="rent"),
        _ReportRecord(type="expense", total=5000, category_code="utilities"),
    ]
    report = build_restaurant_poc_report(records)
    assert report.total_income == 100000
    assert report.total_cost == 45000
    assert report.gross_profit == 55000
    assert abs(report.gross_margin - 0.55) < 0.001
    assert len(report.cost_by_category) == 3
    assert report.cost_by_category[0].category_code == "food_material"
    assert report.cost_by_category[0].amount == 30000


def test_zero_income_report():
    records = [
        _ReportRecord(type="expense", total=50000, category_code="salary"),
        _ReportRecord(type="expense", total=20000, category_code="rent"),
    ]
    report = build_restaurant_poc_report(records)
    assert report.total_income == 0
    assert report.total_cost == 70000
    assert report.gross_profit == -70000
    assert report.gross_margin == 0.0


def test_null_total_treated_as_zero():
    records = [
        _ReportRecord(type="income", total=None),
        _ReportRecord(type="expense", total=None, category_code="other"),
    ]
    report = build_restaurant_poc_report(records)
    assert report.total_income == 0
    assert report.total_cost == 0


def test_format_cents():
    assert format_cents(12345) == "123.45"
    assert format_cents(0) == "0.00"
    assert format_cents(100) == "1.00"


def test_format_percent():
    assert format_percent(0.55) == "55.0%"
    assert format_percent(0.0) == "0.0%"
    assert format_percent(1.0) == "100.0%"


def test_category_names():
    assert CATEGORY_NAMES["food_material"] == "食材"
    assert CATEGORY_NAMES["rent"] == "房租"
    assert CATEGORY_NAMES["platform_fee"] == "平台佣金"


def test_cost_by_category_sorted_desc():
    records = [
        _ReportRecord(type="expense", total=10000, category_code="rent"),
        _ReportRecord(type="expense", total=50000, category_code="food_material"),
        _ReportRecord(type="expense", total=3000, category_code="utilities"),
    ]
    report = build_restaurant_poc_report(records)
    amounts = [cat.amount for cat in report.cost_by_category]
    assert amounts == sorted(amounts, reverse=True)
