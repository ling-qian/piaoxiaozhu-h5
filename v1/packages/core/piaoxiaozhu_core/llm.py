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

    def is_invoice(self, raw_text: Optional[str]) -> bool:
        """判断这段 OCR 文字是否像一张票据。

        只在规则初筛「不像发票」后调用，避免每张票都产生费用。
        判定失败时返回 True（宁可放过，不要误杀用户的正常票据）。
        """
        if not self._api_key or not raw_text:
            return True

        prompt = (
            "下面是一段 OCR 文字。请判断它是不是一张**消费凭证**（记账会用到的单据）。\n\n"
            "**算作凭证**（返回 true）：\n"
            "- 增值税发票（含数电票）、通用机打发票\n"
            "- **超市/便利店购物小票、收银条**（常见特征：商品明细、单价、数量、合计、实收/找零、谢谢惠顾）\n"
            "- 餐饮小票、加油站小票、外卖订单小票、停车缴费凭证\n"
            "- 手写或机打的收据、送货单\n\n"
            "**不算凭证**（返回 false）：\n"
            "- 聊天记录、短信、网页截图\n"
            "- 书本/文档正文、新闻标题\n"
            "- 白纸、风景照、人像、身份证、名片上的文字\n"
            "- 纯商品包装上的说明文字\n\n"
            "注意：小票通常**没有发票代码/税号**，这不是判为 false 的理由。"
            "只要它记录了「买了什么、多少钱」，就算凭证。\n\n"
            f"### OCR 文字\n{raw_text[:1500]}\n\n"
            '只返回 JSON：{"is_invoice": true 或 false, "reason": "一句话理由"}'
        )

        try:
            resp = httpx.post(
                f"{self._base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"},
                json={
                    "model": self._model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0,
                },
                timeout=25.0,
                trust_env=False,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
        except (httpx.HTTPError, KeyError, IndexError, ValueError):
            return True

        parsed = self._extract_json(content)
        if not parsed or "is_invoice" not in parsed:
            return True
        return bool(parsed.get("is_invoice"))

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
                trust_env=False,  # 容器可能注入不可用代理，绕开
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

            json_str = content.strip()
            import re
            code_block = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", json_str, re.DOTALL)
            if code_block:
                json_str = code_block.group(1)
            else:
                obj_match = re.search(r"\{[^{}]*\"category_code\"[^{}]*\}", json_str)
                if obj_match:
                    json_str = obj_match.group(0)

            parsed = json.loads(json_str)
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


# --------------------------------------------------------------------------- 字段纠错

import re as _re
from dataclasses import dataclass, field as _dc_field


@dataclass
class FieldCorrection:
    """字段纠错结果。corrections 只包含「确实改了」的字段。"""

    corrections: dict = _dc_field(default_factory=dict)
    reasons: dict = _dc_field(default_factory=dict)
    ok: bool = False


# 只允许修正这几类字段：都是规则提取最容易出错、且错了影响最大的
_CORRECTABLE_FIELDS = ("merchant_name", "amount", "invoice_date", "invoice_no", "invoice_code")


class LLMFieldCorrector(LLMClassifier):
    """用大模型校正规则提取的票面字段。

    设计约束（都是为了不出错，而不是为了多改）：
    - **只能改，不能编**：提示词明确要求「原文里找不到依据就保持原值」；
    - **输出白名单**：只接受 _CORRECTABLE_FIELDS 里的字段；
    - **格式校验**：金额必须是数字，日期必须是 YYYY-MM-DD，否则丢弃该条修正；
    - **失败即忽略**：网络/解析异常一律返回空结果，调用方继续用原字段。
    """

    def correct_fields(self, raw_text: Optional[str], fields: dict) -> FieldCorrection:
        if not self._api_key or not raw_text:
            return FieldCorrection()

        current = {k: fields.get(k) for k in _CORRECTABLE_FIELDS}
        current_lines = "\n".join(f"- {k}: {v if v not in (None, '') else '（未识别到）'}" for k, v in current.items())

        prompt = (
            "你是票据字段校对助手。下面是 OCR 原文，以及从原文中提取出的字段。\n"
            "请检查每个字段是否与原文矛盾（例如金额被漏读小数点、日期年月日颠倒、商户名少了字、发票号码多一位）。\n\n"
            f"### OCR 原文\n{raw_text[:2500]}\n\n"
            f"### 当前提取结果\n{current_lines}\n\n"
            "### 规则\n"
            "1. 只修正与原文明确矛盾的字段；原文中找不到依据的字段，**不要修改**；\n"
            "2. 金额只返回数字（如 1280.00），不要带货币符号或千分位逗号；\n"
            "3. 日期统一返回 YYYY-MM-DD；\n"
            "4. 不要新增原文中没有的字段；\n"
            "5. 如果没有需要修正的字段，返回空对象。\n\n"
            '只返回 JSON：{"corrections": {"字段名": "修正后的值"}, "reasons": {"字段名": "为什么改"}}'
        )

        try:
            resp = httpx.post(
                f"{self._base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"},
                json={
                    "model": self._model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0,   # 校对要确定性，不要发挥
                },
                timeout=30.0,
                trust_env=False,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
        except (httpx.HTTPError, KeyError, IndexError, ValueError):
            return FieldCorrection()

        parsed = self._extract_json(content)
        if not parsed:
            return FieldCorrection()

        raw_corrections = parsed.get("corrections") or {}
        raw_reasons = parsed.get("reasons") or {}
        out = FieldCorrection(ok=True)

        for key, value in raw_corrections.items():
            if key not in _CORRECTABLE_FIELDS:
                continue
            if value in (None, "", "（未识别到）"):
                continue
            cleaned = self._validate(key, str(value))
            if cleaned is None:
                continue
            # 只接受「确实不同」的修正，避免把原值原样写回来污染理由
            if str(fields.get(key) or "") == cleaned:
                continue
            out.corrections[key] = cleaned
            out.reasons[key] = str(raw_reasons.get(key, ""))[:120]

        return out

    @staticmethod
    def _extract_json(content: str) -> Optional[dict]:
        import json as _json

        text = (content or "").strip()
        block = _re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, _re.DOTALL)
        if block:
            text = block.group(1)
        else:
            obj = _re.search(r"\{.*\}", text, _re.DOTALL)
            if obj:
                text = obj.group(0)
        try:
            data = _json.loads(text)
            return data if isinstance(data, dict) else None
        except _json.JSONDecodeError:
            return None

    @staticmethod
    def _validate(key: str, value: str) -> Optional[str]:
        """按字段做格式校验，不合格直接丢弃这条修正。"""
        v = value.strip()
        if key == "amount":
            cleaned = v.replace(",", "").replace("¥", "").replace("￥", "").strip()
            try:
                num = float(cleaned)
            except ValueError:
                return None
            if num <= 0 or num > 10_000_000:   # 明显不合理的金额不采纳
                return None
            return f"{num:.2f}"
        if key == "invoice_date":
            m = _re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", v)
            if not m:
                return None
            year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if not (2000 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31):
                return None
            return v
        if key in ("invoice_no", "invoice_code"):
            if not _re.fullmatch(r"[0-9A-Za-z]{6,24}", v):
                return None
            return v
        # 商户名：去掉首尾噪声字符，长度上限防空响应
        if len(v) > 60:
            return None
        return v


