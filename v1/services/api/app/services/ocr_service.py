from __future__ import annotations

import re
from typing import Optional

from piaoxiaozhu_core.ocr import PaddleOCRService, OCRResult
from piaoxiaozhu_core.categorize import categorize_expense, CategorizeResult
from piaoxiaozhu_core.llm import LLMClassifier

from app.config import settings


class OCRPipeline:
    def __init__(self):
        self.ocr = PaddleOCRService()
        self.llm = LLMClassifier(
            base_url=settings.LLM_BASE_URL,
            api_key=settings.LLM_API_KEY,
            model_name=settings.LLM_MODEL_NAME,
        )

    async def process(self, image_bytes: bytes) -> dict:
        ocr_result = self._recognize(image_bytes)
        fields = self._extract_fields(ocr_result)
        cat_result = self._categorize(fields)

        if cat_result.confidence < 0.7 and settings.LLM_API_KEY:
            llm_result = self._llm_classify(fields.get("merchant_name"), ocr_result.raw_text)
            if llm_result is not None and llm_result.confidence > cat_result.confidence:
                cat_result = llm_result

        return {
            "raw_text": ocr_result.raw_text,
            "ocr_confidence": ocr_result.confidence,
            "merchant_name": fields.get("merchant_name"),
            "amount": fields.get("amount"),
            "tax_amount": fields.get("tax_amount"),
            "invoice_date": fields.get("invoice_date"),
            "categorize": cat_result,
        }

    def _recognize(self, image_bytes: bytes) -> OCRResult:
        try:
            self.ocr.initialize()
        except Exception:
            return OCRResult(raw_text="", fields={}, confidence=0.0)

        try:
            return self.ocr.recognize(image_bytes)
        except Exception:
            return OCRResult(raw_text="", fields={}, confidence=0.0)

    def _extract_fields(self, ocr_result: OCRResult) -> dict:
        fields: dict = {}
        raw = ocr_result.raw_text

        if not raw:
            return fields

        merchant_match = re.search(
            r"(?:销售方|收款单位|商户|名称)[：:\s]*([^\n,，]{2,50})", raw
        )
        if merchant_match:
            fields["merchant_name"] = merchant_match.group(1).strip()

        amount_patterns = [
            r"(?:金额|合计|总金额|价税合计)[：:\s]*[¥￥]?\s*([\d,]+\.?\d*)",
            r"[¥￥]\s*([\d,]+\.?\d*)",
        ]
        for pattern in amount_patterns:
            amount_match = re.search(pattern, raw)
            if amount_match:
                try:
                    fields["amount"] = float(amount_match.group(1).replace(",", ""))
                except ValueError:
                    pass
                break

        tax_match = re.search(r"(?:税额|税金)[：:\s]*[¥￥]?\s*([\d,]+\.?\d*)", raw)
        if tax_match:
            try:
                fields["tax_amount"] = float(tax_match.group(1).replace(",", ""))
            except ValueError:
                pass

        date_patterns = [
            r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日",
            r"(\d{4})-(\d{1,2})-(\d{1,2})",
            r"(\d{4})/(\d{1,2})/(\d{1,2})",
        ]
        for pattern in date_patterns:
            date_match = re.search(pattern, raw)
            if date_match:
                y, m, d = date_match.group(1), date_match.group(2), date_match.group(3)
                fields["invoice_date"] = f"{y}-{int(m):02d}-{int(d):02d}"
                break

        return fields

    def _categorize(self, fields: dict) -> CategorizeResult:
        return categorize_expense(
            merchant=fields.get("merchant_name"),
            text=fields.get("raw_text"),
            name=fields.get("merchant_name"),
        )

    def _llm_classify(
        self, merchant: Optional[str], raw_text: Optional[str]
    ) -> Optional[CategorizeResult]:
        try:
            categories = [
                "food_material",
                "rent",
                "salary",
                "utilities",
                "platform_fee",
                "advertising",
                "office",
                "other",
            ]
            return self.llm.classify(merchant, raw_text, categories)
        except Exception:
            return None
