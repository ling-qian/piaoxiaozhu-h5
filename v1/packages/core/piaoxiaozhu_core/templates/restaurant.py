from __future__ import annotations

from piaoxiaozhu_core.templates._types import IndustryTemplate

RESTAURANT_CATEGORIES: list[dict[str, str]] = [
    {
        "code": "food_material",
        "name": "食材",
        "color": "#2b8a3e",
        "llm_prompt": "ingredients, vegetables, meat, seafood, frozen food, grain, oil, seasoning, disposable catering supplies",
    },
    {
        "code": "rent",
        "name": "房租",
        "color": "#a61e4d",
        "llm_prompt": "shop rent, lease, property rental, venue rent",
    },
    {
        "code": "salary",
        "name": "工资",
        "color": "#5f3dc4",
        "llm_prompt": "salary, wages, payroll, labor service payment",
    },
    {
        "code": "utilities",
        "name": "水电",
        "color": "#1c7ed6",
        "llm_prompt": "water bill, electricity bill, gas bill, utility cost",
    },
    {
        "code": "platform_fee",
        "name": "平台佣金",
        "color": "#e67700",
        "llm_prompt": "platform commission, delivery platform fee, meituan fee, eleme fee, service fee",
    },
    {
        "code": "advertising",
        "name": "广告",
        "color": "#d9480f",
        "llm_prompt": "advertising, marketing, promotion, flyer, publicity",
    },
    {
        "code": "office",
        "name": "办公",
        "color": "#7048e8",
        "llm_prompt": "office supplies, stationery, printing, paper, consumables",
    },
    {
        "code": "other",
        "name": "其他",
        "color": "#495057",
        "llm_prompt": "other restaurant operating cost that does not fit other categories",
    },
]

RESTAURANT_FIELDS: list[dict[str, str | bool]] = [
    {
        "code": "merchant",
        "name": "商户名称",
        "type": "string",
        "llm_prompt": "merchant or supplier name, keep original visible wording",
        "is_visible_in_list": True,
        "is_visible_in_analysis": True,
        "is_required": True,
        "is_extra": False,
    },
    {
        "code": "issuedAt",
        "name": "日期",
        "type": "string",
        "llm_prompt": "invoice or receipt date in YYYY-MM-DD format",
        "is_visible_in_list": True,
        "is_visible_in_analysis": True,
        "is_required": True,
        "is_extra": False,
    },
    {
        "code": "total",
        "name": "金额",
        "type": "number",
        "llm_prompt": "total amount paid on the receipt or invoice",
        "is_visible_in_list": True,
        "is_visible_in_analysis": True,
        "is_required": True,
        "is_extra": False,
    },
    {
        "code": "categoryCode",
        "name": "分类",
        "type": "string",
        "llm_prompt": "restaurant expense category code, one of: {categories.code}",
        "is_visible_in_list": True,
        "is_visible_in_analysis": True,
        "is_required": True,
        "is_extra": False,
    },
    {
        "code": "taxAmount",
        "name": "税额",
        "type": "number",
        "llm_prompt": "tax amount if clearly shown on the receipt, otherwise leave empty",
        "is_visible_in_list": False,
        "is_visible_in_analysis": True,
        "is_required": False,
        "is_extra": True,
    },
    {
        "code": "note",
        "name": "备注",
        "type": "string",
        "llm_prompt": "",
        "is_visible_in_list": False,
        "is_visible_in_analysis": True,
        "is_required": False,
        "is_extra": False,
    },
    {
        "code": "text",
        "name": "识别文本",
        "type": "string",
        "llm_prompt": "extract all visible text from the receipt or invoice",
        "is_visible_in_list": False,
        "is_visible_in_analysis": False,
        "is_required": False,
        "is_extra": False,
    },
]

RESTAURANT_SETTINGS: list[dict[str, str]] = [
    {
        "code": "default_currency",
        "name": "Default Currency",
        "description": "Default currency for the restaurant POC",
        "value": "CNY",
    },
    {
        "code": "default_category",
        "name": "Default Category",
        "description": "",
        "value": "other",
    },
    {
        "code": "default_project",
        "name": "Default Project",
        "description": "",
        "value": "restaurant_poc",
    },
    {
        "code": "default_type",
        "name": "Default Type",
        "description": "",
        "value": "expense",
    },
    {
        "code": "is_welcome_message_hidden",
        "name": "Do not show welcome message on dashboard",
        "description": "",
        "value": "false",
    },
]

RESTAURANT_MERCHANT_DICT: dict[str, str] = {
    "美团": "platform_fee",
    "美团外卖": "platform_fee",
    "饿了么": "platform_fee",
    "抖音生活服务": "platform_fee",
    "北京蔬菜批发市场": "food_material",
    "新发地农贸市场": "food_material",
    "国家电网": "utilities",
    "自来水公司": "utilities",
    "华润燃气": "utilities",
}

RESTAURANT_TEMPLATE = IndustryTemplate(
    categories=RESTAURANT_CATEGORIES,
    fields=RESTAURANT_FIELDS,
    settings=RESTAURANT_SETTINGS,
    merchant_dict=RESTAURANT_MERCHANT_DICT,
)
