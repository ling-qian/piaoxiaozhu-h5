from __future__ import annotations

import json
from typing import Optional

import httpx

from piaoxiaozhu_core.categorize import CategorizeResult, CATEGORY_L1_MAP, CATEGORY_L2_MAP


class LLMClassifier:
    def __init__(
        self,
        base_url: str = "https://api.openai.com/v1",
        api_key: str = "",
        model_name: str = "gpt-4o-mini",
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model_name = model_name

    def classify(
        self,
        merchant: Optional[str],
        raw_text: Optional[str],
        categories: list[str],
    ) -> CategorizeResult:
        if not self._api_key:
            return CategorizeResult(
                category_code="other",
                category_l1="其他",
                category_l2="",
                confidence=0.0,
                reason="LLM API key 未配置",
            )

        category_list = ", ".join(categories)
        prompt = (
            f"你是一个餐饮成本分类助手。请根据以下票据信息，将支出归类到以下分类之一：\n"
            f"分类列表：{category_list}\n\n"
            f"商户名称：{merchant or '未知'}\n"
            f"票据文本：{raw_text or '未知'}\n\n"
            f"请只返回一个 JSON 对象，格式为：{{\"category_code\": \"...\", \"reason\": \"...\"}}"
        )

        try:
            response = httpx.post(
                f"{self._base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                },
                timeout=30.0,
            )
            response.raise_for_status()
        except httpx.HTTPError:
            return CategorizeResult(
                category_code="other",
                category_l1="其他",
                category_l2="",
                confidence=0.0,
                reason="LLM 请求失败",
            )

        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            code = parsed.get("category_code", "other")
            reason = parsed.get("reason", "LLM 分类")
            if code not in categories:
                code = "other"
            return CategorizeResult(
                category_code=code,
                category_l1=CATEGORY_L1_MAP.get(code, "其他"),
                category_l2=CATEGORY_L2_MAP.get(code, ""),
                confidence=0.7,
                reason=f"LLM分类: {reason}",
            )
        except (KeyError, IndexError, json.JSONDecodeError):
            return CategorizeResult(
                category_code="other",
                category_l1="其他",
                category_l2="",
                confidence=0.0,
                reason="LLM 返回解析失败",
            )
