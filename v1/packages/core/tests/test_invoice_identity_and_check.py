"""票据身份、票面自检、数电票 XML 解析的单元测试。

这些测试用**构造的**票面文本与 XML 样例验证解析规则本身。样例里的发票号码、税号
都是编造的，只用于验证正则与算法，不代表真实票据数据。
"""

from datetime import date

import pytest

from piaoxiaozhu_core.field_extractor import extract_fields
from piaoxiaozhu_core.invoice_check import (
    LEVEL_FAIL,
    LEVEL_OK,
    LEVEL_WARN,
    VERDICT_ATTENTION,
    VERDICT_INSUFFICIENT,
    VERDICT_PASS,
    VERDICT_SUSPECT,
    check_invoice,
    derive_verdict,
    official_verify_elements,
)
from piaoxiaozhu_core.invoice_identity import (
    STRENGTH_STRONG,
    STRENGTH_WEAK,
    invoice_fingerprint,
    invoice_fingerprint_with_strength,
)
from piaoxiaozhu_core.invoice_xml import (
    XMLParseError,
    looks_like_xml,
    parse_einvoice_xml,
)

# 一张自洽的传统增值税发票：价税合计 10000.00 = 不含税 9174.31 + 税额 825.69（9%）
VAT_TEXT = (
    "增值税专用发票\n"
    "发票代码：011002100311\n"
    "发票号码：23456789\n"
    "开票日期：2025年03月15日\n"
    "购买方名称：某某餐饮有限公司\n"
    "纳税人识别号：91110000MA00BUYER1\n"
    "销售方名称：北京新发地农产品批发市场\n"
    "纳税人识别号：91110000MA00SELL1\n"
    "金额：9174.31\n"
    "税率：9%\n"
    "税额：825.69\n"
    "价税合计：10000.00\n"
)

# 数电票：20 位号码、没有发票代码
EINVOICE_TEXT = (
    "电子发票（普通发票）\n"
    "发票号码：25114400000012345678\n"
    "开票日期：2026年03月15日\n"
    "销售方名称：某某供应链有限公司\n"
    "纳税人识别号：91310000MA1FL0000X\n"
    "价税合计：¥1060.00\n"
    "税额：60.00\n"
)


# ---------- 身份字段抽取 ----------


def test_extract_identity_from_vat_invoice():
    result = extract_fields(VAT_TEXT)
    assert result.invoice_code == "011002100311"
    assert result.invoice_no == "23456789"
    # 购买方在前、销售方在后，取最后一个税号
    assert result.seller_tax_no == "91110000MA00SELL1"


def test_extract_identity_from_einvoice_without_code():
    result = extract_fields(EINVOICE_TEXT)
    assert result.invoice_no == "25114400000012345678"
    # 数电票没有发票代码，读不到是正常的，不能算识别失败
    assert result.invoice_code is None
    assert result.seller_tax_no == "91310000MA1FL0000X"


def test_invoice_no_does_not_swallow_trailing_digits():
    text = "发票号码：12345678\n机器编号：99887766\n"
    assert extract_fields(text).invoice_no == "12345678"


# ---------- 查重指纹 ----------


def test_fingerprint_strong_when_invoice_no_present():
    result = invoice_fingerprint_with_strength(
        invoice_type="vat_special", invoice_code="011002100311", invoice_no="23456789"
    )
    assert result is not None
    fingerprint, strength = result
    assert strength == STRENGTH_STRONG
    assert fingerprint.startswith("v1:")


def test_fingerprint_stable_across_noise():
    a = invoice_fingerprint(invoice_code="0110-0210-0311", invoice_no="2345 6789")
    b = invoice_fingerprint(invoice_code="011002100311", invoice_no="23456789")
    assert a == b and a is not None


def test_fingerprint_differs_between_invoices():
    a = invoice_fingerprint(invoice_no="23456789")
    b = invoice_fingerprint(invoice_no="23456780")
    assert a != b


def test_fingerprint_weak_fallback_needs_all_three_parts():
    result = invoice_fingerprint_with_strength(
        seller_tax_no="91110000MA00SELL1",
        invoice_date="2025-03-15",
        total_amount_cents=1000000,
    )
    assert result is not None and result[1] == STRENGTH_WEAK
    # 缺一个要素就退回到「不查重」，避免拿不可靠字段乱判重
    assert invoice_fingerprint(seller_tax_no="91110000MA00SELL1", invoice_date="2025-03-15") is None
    assert invoice_fingerprint(seller_tax_no="91110000MA00SELL1", total_amount_cents=1000000) is None


def test_fingerprint_none_when_only_merchant_known():
    assert invoice_fingerprint(invoice_type="receipt") is None


# ---------- 票面自检 ----------


def test_check_consistent_invoice_passes():
    checks = check_invoice(
        invoice_type="vat_special",
        invoice_code="011002100311",
        invoice_no="23456789",
        seller_tax_no="91110000MA00SELL1",
        invoice_date="2025-03-15",
        total_amount_cents=1000000,
        tax_amount_cents=82569,
        today=date(2026, 10, 17),
    )
    assert derive_verdict(checks) == VERDICT_PASS
    assert all(c.level == LEVEL_OK for c in checks)


def test_check_detects_impossible_tax_ratio():
    # 税额 5000 / 不含税 5000 = 100%，不属于任何常见税率档位
    checks = check_invoice(total_amount_cents=10000, tax_amount_cents=5000)
    amounts = next(c for c in checks if c.key == "amounts")
    assert amounts.level == LEVEL_FAIL
    assert derive_verdict(checks) == VERDICT_SUSPECT


def test_check_detects_tax_larger_than_total():
    checks = check_invoice(total_amount_cents=10000, tax_amount_cents=12000)
    amounts = next(c for c in checks if c.key == "amounts")
    assert amounts.level == LEVEL_FAIL


def test_check_flags_einvoice_with_invoice_code():
    checks = check_invoice(invoice_no="25114400000012345678", invoice_code="011002100311")
    code = next(c for c in checks if c.key == "invoice_code")
    assert code.level == LEVEL_WARN


def test_check_flags_future_invoice_date():
    checks = check_invoice(invoice_date="2027-01-01", today=date(2026, 10, 17))
    d = next(c for c in checks if c.key == "date")
    assert d.level == LEVEL_WARN


def test_verdict_insufficient_when_nothing_identified():
    checks = check_invoice()
    assert all(c.level == LEVEL_WARN for c in checks)
    assert derive_verdict(checks) == VERDICT_INSUFFICIENT


def test_verdict_attention_when_partially_identified():
    checks = check_invoice(invoice_no="23456789", today=date(2026, 10, 17))
    assert derive_verdict(checks) == VERDICT_ATTENTION


# ---------- 官方查验要素 ----------


def test_official_elements_complete_for_vat_invoice():
    payload = official_verify_elements(
        invoice_code="011002100311",
        invoice_no="23456789",
        invoice_date="2025/3/15",
        total_amount_cents=1000000,
        tax_amount_cents=82569,
    )
    assert payload["complete"] is True
    assert payload["missing"] == []
    # 不含税金额 = 价税合计 − 税额
    assert payload["elements"]["amount_without_tax"] == "9174.31"
    assert payload["elements"]["invoice_date"] == "2025-03-15"


def test_official_elements_flag_missing_pieces():
    payload = official_verify_elements(invoice_no="23456789")
    assert payload["complete"] is False
    assert set(payload["missing"]) == {"invoice_date", "amount_without_tax"}


# ---------- 数电票 XML ----------

EINVOICE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<EInvoice>
  <Header><EIid>25114400000012345678</EIid></Header>
  <TaxSupervisionInfo>
    <InvoiceNumber>25114400000012345678</InvoiceNumber>
    <IssueTime>2026-03-15</IssueTime>
  </TaxSupervisionInfo>
  <SellerInformation>
    <SellerName>某某供应链有限公司</SellerName>
    <SellerIdNum>91310000ma1fl0000x</SellerIdNum>
  </SellerInformation>
  <IssuItemInformation>
    <TotaltaxIncludedAmount>1060.00</TotaltaxIncludedAmount>
    <TotalTaxAmount>60.00</TotalTaxAmount>
  </IssuItemInformation>
</EInvoice>
"""


def test_looks_like_xml():
    assert looks_like_xml(EINVOICE_XML.encode()) is True
    assert looks_like_xml(b"\xff\xd8\xff\xe0 image bytes") is False


def test_parse_einvoice_xml_via_alias_table():
    result = parse_einvoice_xml(EINVOICE_XML.encode())
    assert result["matched_by"] == "alias"
    assert result["invoice_no"] == "25114400000012345678"
    assert result["invoice_date"] == "2026-03-15"
    assert result["merchant_name"] == "某某供应链有限公司"
    assert result["tax_no"] == "91310000MA1FL0000X"
    assert result["amount"] == 1060.0
    assert result["tax_amount"] == 60.0
    # 20 位号码即数电票
    assert result["invoice_type"] == "einvoice"
    # 解析结果可以直接喂给 upsert_ocr_record，必须有 categorize
    assert result["categorize"] is not None


def test_parse_einvoice_xml_falls_back_to_text_rules():
    # 别名表覆盖不到的版式（中文标签），走原文规则
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<发票>"
        "<发票号码>23456789</发票号码>"
        "<开票日期>2025年03月15日</开票日期>"
        "<销售方名称>北京新发地农产品批发市场</销售方名称>"
        "<价税合计>10000.00</价税合计>"
        "</发票>"
    ).encode()
    result = parse_einvoice_xml(xml)
    assert result["matched_by"] == "text_rules"
    assert result["invoice_no"] == "23456789"
    assert result["invoice_date"] == "2025-03-15"
    assert result["amount"] == 10000.0


def test_parse_einvoice_xml_reports_none_when_unrecognized():
    xml = b'<?xml version="1.0"?><Foo><Bar>1</Bar></Foo>'
    result = parse_einvoice_xml(xml)
    assert result["matched_by"] == "none"
    assert result["invoice_no"] is None
    # 即使字段解析不出来，也不能抛异常——归档仍要继续
    assert result["tags_seen"] == 1


def test_parse_einvoice_xml_rejects_doctype():
    xml = b'<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x "boom">]><EInvoice>&x;</EInvoice>'
    with pytest.raises(XMLParseError):
        parse_einvoice_xml(xml)


def test_parse_einvoice_xml_rejects_broken_xml():
    with pytest.raises(XMLParseError):
        parse_einvoice_xml(b"<EInvoice><SellerName>unclosed")


def test_parse_einvoice_xml_handles_gbk_encoded():
    xml = EINVOICE_XML.replace("某某供应链有限公司", "某某供应链有限公司").encode("gb18030")
    result = parse_einvoice_xml(xml)
    assert result["invoice_no"] == "25114400000012345678"


# ---------- 小票（无发票号/代码）不应被当成「有问题的发票」 ----------


def test_receipt_without_invoice_no_is_not_flagged():
    """超市小票天然没有发票号/代码/税号，不应因此被判为需关注。"""
    checks = check_invoice(
        total_amount_cents=12800,
        invoice_date="2026-10-21",
    )
    assert derive_verdict(checks) == VERDICT_PASS
    assert all(c.level == LEVEL_OK for c in checks)


def test_blank_extraction_stays_insufficient_not_receipt():
    """什么都没识别到 ≠ 小票。必须保持 insufficient，提示用户重拍。

    这条是防回归：曾把「无发票号」无条件降级为 ok，导致空白结果也变成 pass，
    等于把一次识别失败包装成「检查通过」。
    """
    checks = check_invoice()
    assert derive_verdict(checks) == VERDICT_INSUFFICIENT
    assert all(c.level == LEVEL_WARN for c in checks)
