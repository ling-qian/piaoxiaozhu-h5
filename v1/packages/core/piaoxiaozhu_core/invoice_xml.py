"""数电票 XML 解析 —— 数电票归档链路的第一步。

**关于字段名的可信度，必须先说清楚。**

数电票（全面数字化的电子发票）可以下载 XML 原件。据检索到的真实样例，其根元素是
`<EInvoice>`、标签为英文；但**具体字段标签名只找到自媒体与技术博客来源，没有检索到
公开的官方规范**（财政部《电子凭证会计数据标准——全面数字化的电子发票（试行版）》
列出了标准标签，但税务口径的《电子发票业务数据规范》《电子发票数据电文规范》未见
公开文档）。因此本模块的取值策略是**别名表 + 原文规则双重兜底**，并且把「靠哪一路
命中」如实回报给调用方，而不是假装解析是权威的：

1. 先按别名表匹配英文标签（aliases 覆盖常见写法，命中记 `matched_by="alias"`）。
2. 别名表一无所获时，把 XML 文本交给 `field_extractor` 的中文标签规则再试一次
   （部分版式/导出工具使用中文标签，命中记 `matched_by="text_rules"`）。
3. 两路都没命中就诚实返回 `matched_by="none"`，让上层按「仅归档、字段待人工补录」处理。

无论解析结果如何，**原始 XML 文件都会保留**（归档是数电票的硬性要求，解析只是附赠）。

安全：解析用户上传的 XML 前先拒绝含 `<!DOCTYPE` / `<!ENTITY` 的文档。标准库
ElementTree 会展开内部实体定义，放任不管等于把「十亿笑声」这类实体膨胀攻击引进来。
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Optional

from piaoxiaozhu_core.categorize import categorize_expense
from piaoxiaozhu_core.field_extractor import extract_fields

MAX_XML_BYTES = 5 * 1024 * 1024

# 别名表：normalized tag → 内部字段名。
# 这些标签名来自公开样例与技术博客（非官方规范），因此只做「尽量匹配」，
# 匹配不到就退回中文文本规则，绝不臆造字段。
_ALIASES: dict[str, str] = {
    # 发票号码：数电票的 <EIid> 与 <InvoiceNumber> 都指向发票号码
    "eiid": "invoice_no",
    "invoicenumber": "invoice_no",
    "invoiceno": "invoice_no",
    # 开票日期
    "issuetime": "invoice_date",
    "invoicedate": "invoice_date",
    "issuingtime": "invoice_date",
    # 销售方
    "sellername": "merchant_name",
    "selleridnum": "seller_tax_no",
    "sellertaxno": "seller_tax_no",
    "sellertaxid": "seller_tax_no",
    # 金额
    "totaltaxincludedamount": "total_amount",
    "totalamountwithtax": "total_amount",
    "totalamount": "total_amount",
    "totaltaxamount": "tax_amount",
    "totaltax": "tax_amount",
    "taxamount": "tax_amount",
    "totalamountwithouttax": "amount_without_tax",
    "amountwithouttax": "amount_without_tax",
}

_TAG_NS = re.compile(r"^\{.*\}")
# 归一化标签名：英文标签统一小写、去掉命名空间与标点，但**保留中日韩字符**。
# 若把 CJK 也一并去掉，中文标签会退化成空串，兜底的文本规则就再也认不出
# 「发票号码」这类标签，数电票的另一种版式会整片解析失败。
_NON_ALNUM = re.compile(r"[^0-9a-z\u4e00-\u9fff]")
_DATE_IN_TEXT = re.compile(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})")


class XMLParseError(ValueError):
    """XML 无法解析（含被拒绝的危险构造）"""


def looks_like_xml(content: bytes) -> bool:
    head = content[:512].lstrip()
    return head.startswith(b"<?xml") or b"<EInvoice" in head


def parse_einvoice_xml(content: bytes) -> dict:
    """解析数电票 XML，返回与 `OCRPipeline.process` 同形状的结果字典。

    调用方（`upsert_ocr_record`）不需要为 XML 单独写一套写库逻辑。
    """
    if len(content) > MAX_XML_BYTES:
        raise XMLParseError(f"XML 超过 {MAX_XML_BYTES // 1024 // 1024}MB 上限")

    text = _decode(content)
    if "<!doctype" in text.lower() or "<!entity" in text.lower():
        # 实体膨胀攻击与外部实体注入都靠这两个构造，用户上传的 XML 一律拒绝
        raise XMLParseError("XML 包含 DOCTYPE/ENTITY 声明，已拒绝解析")

    try:
        root = ET.fromstring(text)
    except ET.ParseError as e:
        raise XMLParseError(f"XML 解析失败：{e}") from e

    pairs = _collect_tag_pairs(root)
    dump = _readable_dump(pairs)
    fields, matched_by = _match_aliases(pairs)

    if matched_by == "none":
        # 别名表没命中，用中文标签规则在「标签: 值」形态的文本上再试一次。
        # 不能直接拿原始 XML 去跑规则，两个原因：正则要求的是「标签：值」，而 XML 里
        # 这两者被尖括号隔开（<发票号码>23456789</发票号码>）必然匹配落空；而 XML 声明
        # 里的 version="1.0" 又会被金额规则当成一个 1.00 元的数抓走。
        fields = _from_extracted(extract_fields(dump))
        if not _has_strong_field(fields):
            # extract_fields 的最后兜底会把任意文本行当成商户名，只命中这个字段
            # 说明其实什么都没解析出来，不能装作解析成功。
            fields = {}
            matched_by = "none"
        else:
            matched_by = "text_rules"

    einvoice = _is_einvoice_no(fields.get("invoice_no"))
    invoice_type = "einvoice" if einvoice else None

    cat = categorize_expense(
        merchant=fields.get("merchant_name"),
        text=text,
        name=fields.get("merchant_name"),
    )

    return {
        "raw_text": dump,
        "ocr_confidence": 0.0,  # 无 OCR 置信度可言，留 0 避免与真实 OCR 混淆
        "merchant_name": fields.get("merchant_name"),
        "amount": fields.get("total_amount"),
        "tax_amount": fields.get("tax_amount"),
        "invoice_date": fields.get("invoice_date"),
        "invoice_code": fields.get("invoice_code"),
        "invoice_no": fields.get("invoice_no"),
        "tax_no": fields.get("seller_tax_no"),
        "amount_without_tax": fields.get("amount_without_tax"),
        "invoice_type": invoice_type,
        "categorize": cat,
        "source": "xml",
        "matched_by": matched_by,
        "tags_seen": len(pairs),
    }


def _decode(content: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise XMLParseError("无法识别 XML 编码（尝试过 UTF-8 与 GB18030）")


def _collect_tag_pairs(root: ET.Element) -> list[tuple[str, str]]:
    """展开整棵树，得到 (归一化后的标签名, 文本) 列表"""
    pairs: list[tuple[str, str]] = []
    for element in root.iter():
        tag = _normalize_tag(element.tag)
        value = (element.text or "").strip()
        if tag and value:
            pairs.append((tag, value))
    return pairs


def _normalize_tag(tag: str) -> str:
    tag = _TAG_NS.sub("", tag or "")
    return _NON_ALNUM.sub("", tag.lower())


def _match_aliases(pairs: list[tuple[str, str]]) -> tuple[dict, str]:
    fields: dict = {}
    for tag, value in pairs:
        key = _ALIASES.get(tag)
        if key and fields.get(key) is None:
            fields[key] = _coerce(key, value)
    return fields, ("alias" if any(v is not None for v in fields.values()) else "none")


def _coerce(key: str, value: str) -> Optional[object]:
    if key in ("total_amount", "tax_amount", "amount_without_tax"):
        return _yuan_to_float(value)
    if key == "invoice_date":
        return _normalize_date(value)
    if key == "invoice_no":
        digits = re.sub(r"\D", "", value)
        return digits or None
    if key == "seller_tax_no":
        # 与 field_extractor 的销方税号保持一致：统一大写，便于查重比对
        return value.strip().upper() or None
    return value.strip() or None


def _yuan_to_float(value: str) -> Optional[float]:
    cleaned = re.sub(r"[^\d.\-]", "", value.replace(",", ""))
    try:
        return round(float(cleaned), 2)
    except ValueError:
        return None


def _normalize_date(value: str) -> Optional[str]:
    m = _DATE_IN_TEXT.search(value)
    if not m:
        return None
    return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def _from_extracted(extracted) -> dict:
    fields: dict = {}
    if extracted.merchant_name:
        fields["merchant_name"] = extracted.merchant_name
    if extracted.total_amount is not None:
        fields["total_amount"] = extracted.total_amount / 100.0
    if extracted.tax_amount is not None:
        fields["tax_amount"] = extracted.tax_amount / 100.0
    if extracted.invoice_date:
        fields["invoice_date"] = extracted.invoice_date
    if extracted.invoice_code:
        fields["invoice_code"] = extracted.invoice_code
    if extracted.invoice_no:
        fields["invoice_no"] = extracted.invoice_no
    if extracted.seller_tax_no:
        fields["seller_tax_no"] = extracted.seller_tax_no
    return fields


def _is_einvoice_no(value) -> bool:
    return bool(value) and len(re.sub(r"\D", "", str(value))) == 20


def _has_strong_field(fields: dict) -> bool:
    """是否至少命中一个「有价值的」字段。

    刻意把 merchant_name 排除在外：`extract_fields` 的兜底逻辑会把任意一行非纯数字
    文本当成商户名，仅凭它不足以证明解析成功。
    """
    return any(fields.get(key) is not None for key in _STRONG_KEYS)


_STRONG_KEYS = (
    "invoice_no",
    "invoice_code",
    "total_amount",
    "tax_amount",
    "invoice_date",
    "seller_tax_no",
)


def _readable_dump(pairs: list[tuple[str, str]], limit: int = 4000) -> str:
    """把标签与文本拼成可读文本存进 raw_text，便于排查解析问题。

    只截取前 limit 个字符：数电票 XML 里明细行很多，完整存档另有原始文件承担，
    这里的用途只是「出问题时能看出解析到了什么」。
    """
    lines = [f"{tag}: {value}" for tag, value in pairs]
    return "\n".join(lines)[:limit]
