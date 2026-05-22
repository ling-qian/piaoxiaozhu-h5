from piaoxiaozhu_core.categorize import categorize_expense, CategorizeResult


def test_merchant_dict_exact_match_meituan():
    result = categorize_expense(merchant="美团")
    assert result.category_code == "platform_fee"
    assert result.confidence == 1.0
    assert "精确匹配" in result.reason


def test_merchant_dict_exact_match_eleme():
    result = categorize_expense(merchant="饿了么")
    assert result.category_code == "platform_fee"
    assert result.confidence == 1.0


def test_merchant_dict_exact_match_vegetable_market():
    result = categorize_expense(merchant="新发地农贸市场")
    assert result.category_code == "food_material"
    assert result.confidence == 1.0


def test_receipt_text_food_material():
    result = categorize_expense(merchant="某某商店", text="购买蔬菜和生鲜")
    assert result.category_code == "food_material"
    assert result.confidence == 0.95
    assert result.category_l1 == "食材"


def test_receipt_text_rent():
    result = categorize_expense(text="本月房租缴纳")
    assert result.category_code == "rent"
    assert result.category_l1 == "房租"


def test_receipt_text_utilities():
    result = categorize_expense(text="电费缴纳通知")
    assert result.category_code == "utilities"
    assert result.category_l1 == "水电"


def test_receipt_text_salary():
    result = categorize_expense(name="工资表-3月")
    assert result.category_code == "salary"
    assert result.category_l1 == "工资"


def test_receipt_text_advertising():
    result = categorize_expense(text="广告推广费用")
    assert result.category_code == "advertising"
    assert result.category_l1 == "广告"


def test_receipt_text_office():
    result = categorize_expense(text="办公用品采购")
    assert result.category_code == "office"
    assert result.category_l1 == "办公"


def test_fallback_to_other():
    result = categorize_expense(merchant="未知商户", text="一些无关文字")
    assert result.category_code == "other"
    assert result.confidence == 0.5
    assert result.category_l1 == "其他"


def test_no_input_at_all():
    result = categorize_expense()
    assert result.category_code == "other"
    assert result.confidence == 0.5


def test_layer1_priority_over_layer2():
    result = categorize_expense(merchant="国家电网", text="购买蔬菜")
    assert result.category_code == "utilities"
    assert result.confidence == 1.0


def test_manual_corrected_flag():
    result = CategorizeResult(
        category_code="food_material",
        category_l1="食材",
        category_l2="蔬菜/生鲜",
        confidence=1.0,
        reason="手动修正",
        is_manual_corrected=True,
    )
    assert result.is_manual_corrected is True
