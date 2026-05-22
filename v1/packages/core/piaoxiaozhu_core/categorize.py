from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

from piaoxiaozhu_core.templates.restaurant import RESTAURANT_MERCHANT_DICT

if TYPE_CHECKING:
    from piaoxiaozhu_core.llm import LLMClassifier


@dataclass(frozen=True)
class CategorizeResult:
    category_code: str
    category_l1: str
    category_l2: str
    confidence: float
    reason: str
    is_manual_corrected: bool = False


CATEGORY_L1_MAP: dict[str, str] = {
    "food_material": "食材",
    "rent": "房租",
    "salary": "工资",
    "utilities": "水电",
    "platform_fee": "平台佣金",
    "advertising": "广告",
    "office": "办公",
    "other": "其他",
}

CATEGORY_L2_MAP: dict[str, str] = {
    "food_material": "蔬菜/生鲜/粮油/冻品/调味/肉禽/海鲜/米/面/食材/农贸",
    "rent": "房租/租赁/物业/场地/租金",
    "salary": "工资/薪资/劳务/用工/工资表",
    "utilities": "电费/水费/燃气/天然气/供电/供水",
    "platform_fee": "美团/饿了么/抖音/平台服务费/技术服务费/佣金/平台扣点",
    "advertising": "广告/推广/营销/传单/宣传",
    "office": "办公/文具/打印/纸张/耗材",
    "other": "",
}

_llm_classifier_instance: Optional[LLMClassifier] = None


def set_llm_classifier(classifier: Optional[LLMClassifier]) -> None:
    global _llm_classifier_instance
    _llm_classifier_instance = classifier


class _ReceiptRule:
    __slots__ = ("category_code", "keywords", "reason")

    def __init__(self, category_code: str, keywords: list[str], reason: str) -> None:
        self.category_code = category_code
        self.keywords = keywords
        self.reason = reason


_RECEIPT_RULES: list[_ReceiptRule] = [
    _ReceiptRule(
        "platform_fee",
        ["美团", "饿了么", "抖音", "平台服务费", "技术服务费", "佣金", "平台扣点"],
        "命中平台服务相关关键词",
    ),
    _ReceiptRule(
        "food_material",
        ["蔬菜", "生鲜", "粮油", "冻品", "调味", "牛肉", "猪肉", "鸡肉", "海鲜", "米", "面", "食材", "农贸"],
        "命中食材采购相关关键词",
    ),
    _ReceiptRule(
        "rent",
        ["房租", "租赁", "物业", "场地", "租金"],
        "命中房租场地相关关键词",
    ),
    _ReceiptRule(
        "utilities",
        ["电费", "水费", "燃气", "天然气", "供电", "供水"],
        "命中水电燃气相关关键词",
    ),
    _ReceiptRule(
        "salary",
        ["工资", "薪资", "劳务", "用工", "工资表"],
        "命中工资劳务相关关键词",
    ),
    _ReceiptRule(
        "advertising",
        ["广告", "推广", "营销", "传单", "宣传"],
        "命中广告推广相关关键词",
    ),
    _ReceiptRule(
        "office",
        ["办公", "文具", "打印", "纸张", "耗材"],
        "命中办公用品相关关键词",
    ),
]


def _layer1_merchant_dict(merchant: Optional[str]) -> Optional[CategorizeResult]:
    if not merchant:
        return None
    matched_code = RESTAURANT_MERCHANT_DICT.get(merchant)
    if matched_code is None:
        return None
    return CategorizeResult(
        category_code=matched_code,
        category_l1=CATEGORY_L1_MAP.get(matched_code, "其他"),
        category_l2=CATEGORY_L2_MAP.get(matched_code, ""),
        confidence=1.0,
        reason=f"商户名称精确匹配: {merchant}",
    )


def _layer2_receipt_text(
    merchant: Optional[str],
    text: Optional[str],
    name: Optional[str],
) -> Optional[CategorizeResult]:
    parts: list[str] = [s for s in (merchant, text, name) if s]
    source = " ".join(parts)
    if not source:
        return None
    for rule in _RECEIPT_RULES:
        if any(kw in source for kw in rule.keywords):
            return CategorizeResult(
                category_code=rule.category_code,
                category_l1=CATEGORY_L1_MAP.get(rule.category_code, "其他"),
                category_l2=CATEGORY_L2_MAP.get(rule.category_code, ""),
                confidence=0.95,
                reason=rule.reason,
            )
    return None


def _layer3_template_priority(
    merchant: Optional[str],
    text: Optional[str],
    name: Optional[str],
) -> Optional[CategorizeResult]:
    return None


def _layer4_llm(
    merchant: Optional[str],
    text: Optional[str],
    name: Optional[str],
    llm_classifier: Optional[LLMClassifier] = None,
) -> Optional[CategorizeResult]:
    classifier = llm_classifier or _llm_classifier_instance
    if classifier is None:
        return None
    categories = list(CATEGORY_L1_MAP.keys())
    return classifier.classify(merchant, text or name, categories)


def _make_other_result(reason: str) -> CategorizeResult:
    return CategorizeResult(
        category_code="other",
        category_l1="其他",
        category_l2="",
        confidence=0.5,
        reason=reason,
    )


def categorize_expense(
    merchant: Optional[str] = None,
    text: Optional[str] = None,
    name: Optional[str] = None,
    llm_classifier: Optional[LLMClassifier] = None,
) -> CategorizeResult:
    result = _layer1_merchant_dict(merchant)
    if result is not None:
        return result

    result = _layer2_receipt_text(merchant, text, name)
    if result is not None:
        return result

    result = _layer3_template_priority(merchant, text, name)
    if result is not None:
        return result

    result = _layer4_llm(merchant, text, name, llm_classifier)
    if result is not None:
        return result

    return _make_other_result("未命中特定规则，归类为其他")
