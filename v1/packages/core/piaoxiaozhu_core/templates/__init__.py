from __future__ import annotations

from piaoxiaozhu_core.templates._types import IndustryTemplate
from piaoxiaozhu_core.templates.restaurant import RESTAURANT_TEMPLATE

TEMPLATE_REGISTRY: dict[str, IndustryTemplate] = {
    "restaurant": RESTAURANT_TEMPLATE,
}


def get_template(industry: str) -> IndustryTemplate:
    template = TEMPLATE_REGISTRY.get(industry)
    if template is None:
        raise ValueError(f"未找到行业模板: {industry}，可用模板: {list(TEMPLATE_REGISTRY.keys())}")
    return template
