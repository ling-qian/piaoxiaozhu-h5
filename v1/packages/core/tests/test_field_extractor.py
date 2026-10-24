from piaoxiaozhu_core.field_extractor import extract_fields, ExtractedFields


def test_vat_invoice_extraction():
    text = (
        "增值税专用发票\n"
        "发票代码：011002100311\n"
        "发票号码：23456789\n"
        "开票日期：2025年03月15日\n"
        "购买方：北京某某餐饮有限公司\n"
        "销售方名称：北京新发地农产品批发市场\n"
        "货物名称：蔬菜 生鲜\n"
        "金额：1580.00\n"
        "税率：9%\n"
        "税额：142.20\n"
        "价税合计：1722.20\n"
    )
    result = extract_fields(text)
    assert isinstance(result, ExtractedFields)
    assert result.merchant_name == "北京新发地农产品批发市场"
    assert result.total_amount == 172220
    assert result.tax_amount == 14220
    assert result.invoice_date == "2025-03-15"
    assert result.invoice_type == "vat_special"


def test_restaurant_receipt_extraction():
    text = (
        "某某餐饮店\n"
        "收据\n"
        "2025/04/20\n"
        "菜品：宫保鸡丁 x2  58.00\n"
        "菜品：鱼香肉丝 x1  38.00\n"
        "合计：96.00\n"
    )
    result = extract_fields(text)
    assert result.merchant_name == "某某餐饮店"
    assert result.total_amount == 9600
    assert result.invoice_date == "2025-04-20"
    assert result.invoice_type == "receipt"


def test_meituan_platform_fee_receipt():
    text = (
        "美团外卖\n"
        "技术服务费\n"
        "商户名称：张记面馆\n"
        "2025-05-01\n"
        "服务费金额：¥326.50\n"
        "税率：6%\n"
        "税额：18.49\n"
    )
    result = extract_fields(text)
    assert result.merchant_name == "张记面馆"
    assert result.total_amount == 32650
    assert result.tax_amount == 1849
    assert result.invoice_date == "2025-05-01"


def test_empty_text():
    result = extract_fields("")
    assert result.merchant_name is None
    assert result.total_amount is None
    assert result.tax_amount is None
    assert result.invoice_date is None
    assert result.invoice_type is None


def test_date_various_formats():
    text_cn = "开票日期：2024年12月05日"
    result = extract_fields(text_cn)
    assert result.invoice_date == "2024-12-05"

    text_dash = "日期：2023-07-22"
    result = extract_fields(text_dash)
    assert result.invoice_date == "2023-07-22"

    text_slash = "2024/01/30"
    result = extract_fields(text_slash)
    assert result.invoice_date == "2024-01-30"

    text_dot = "2023.11.15"
    result = extract_fields(text_dot)
    assert result.invoice_date == "2023-11-15"


def test_amount_with_yen_symbol():
    text = "应付金额：¥1,280.50"
    result = extract_fields(text)
    assert result.total_amount == 128050

    text2 = "总计：￥5,600.00"
    result2 = extract_fields(text2)
    assert result2.total_amount == 560000


def test_tax_extraction():
    text = "税额：256.30\n合计：3200.00"
    result = extract_fields(text)
    assert result.tax_amount == 25630

    text_rate = "税率：13%\n合计：11300.00"
    result_rate = extract_fields(text_rate)
    assert result_rate.tax_amount is not None
    assert result_rate.tax_amount > 0


def test_merchant_name_extraction():
    text1 = "销售方：上海某某供应链有限公司"
    result1 = extract_fields(text1)
    assert result1.merchant_name == "上海某某供应链有限公司"

    text2 = "收款单位：广州天河粮油批发"
    result2 = extract_fields(text2)
    assert result2.merchant_name == "广州天河粮油批发"

    text3 = "商户：李记调料行"
    result3 = extract_fields(text3)
    assert result3.merchant_name == "李记调料行"


def test_electronic_invoice_type():
    text = (
        "电子发票\n"
        "增值税普通发票\n"
        "开票日期：2025年06月01日\n"
        "金额：450.00\n"
    )
    result = extract_fields(text)
    assert result.invoice_type == "vat_normal_electronic"


def test_vat_normal_invoice_type():
    text = (
        "增值税普通发票\n"
        "开票日期：2025年01月10日\n"
        "金额：230.00\n"
    )
    result = extract_fields(text)
    assert result.invoice_type == "vat_normal"


def test_largest_number_fallback():
    text = (
        "某某商店\n"
        "商品A 12.50\n"
        "商品B 8.30\n"
        "商品C 45.00\n"
    )
    result = extract_fields(text)
    assert result.total_amount == 4500


def test_vat_invoice_merchant_prefers_seller():
    """真实版式：购买方在前、销售方在后，且「销售方信息」是独立一行、不带冒号。

    回归点：兜底的「名称：」曾先命中购买方，把客户名当成供应商名。
    """
    text = (
        "增值税电子普通发票\n"
        "购买方信息\n"
        "名称：张三科技有限公司\n"
        "纳税人识别号：91310000MA1FL0XXXX\n"
        "销售方信息\n"
        "名称：老王烧烤店\n"
        "纳税人识别号：91310101MA1FP0YYYY\n"
        "开票日期：2026年10月01日\n"
    )
    result = extract_fields(text)
    assert result.merchant_name == "老王烧烤店"


def test_tax_computed_from_rate_when_header_only():
    """表格式发票里「税额」只是列头，明细中的数字没有标签可挂。

    回归点：原实现只看「税额：」标签，导致税额恒为 None；
    现按价内税公式「价税合计 ÷ (1+税率) × 税率」反推。
    """
    text = (
        "增值税电子普通发票\n"
        "项目名称 金额 税率 税额\n"
        "餐饮服务 124.76 3% 3.74\n"
        "（小写）¥128.50\n"
    )
    result = extract_fields(text)
    assert result.total_amount == 12850
    assert result.tax_amount == 374


def test_tax_computed_when_item_row_glued():
    """OCR 把明细三列并成一个框时，会得到 "124.763%3.74" 这样的粘连文本。"""
    text = (
        "项目名称\n"
        "金额税率税额\n"
        "餐饮服务\n"
        "124.763%3.74\n"
        "（小写）￥128.50\n"
    )
    result = extract_fields(text)
    assert result.total_amount == 12850
    assert result.tax_amount == 374
