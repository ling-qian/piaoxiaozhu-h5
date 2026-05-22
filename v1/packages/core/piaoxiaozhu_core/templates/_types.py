from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class IndustryTemplate:
    categories: list[dict[str, Any]]
    fields: list[dict[str, Any]]
    settings: list[dict[str, Any]]
    merchant_dict: dict[str, str]
