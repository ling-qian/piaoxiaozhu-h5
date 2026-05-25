from __future__ import annotations

import logging
import os
import threading
from typing import Optional

from piaoxiaozhu_core.ocr import PaddleOCRService, OCRResult
from piaoxiaozhu_core.categorize import categorize_expense, CategorizeResult
from piaoxiaozhu_core.field_extractor import extract_fields
from piaoxiaozhu_core.llm import LLMClassifier

from app.config import settings

logger = logging.getLogger(__name__)

_ocr_instance: Optional[PaddleOCRService] = None
_ocr_lock = threading.Lock()


def _get_ocr_service() -> PaddleOCRService:
    global _ocr_instance
    if _ocr_instance is not None:
        return _ocr_instance

    with _ocr_lock:
        if _ocr_instance is not None:
            return _ocr_instance

        original_home = os.environ.get("HOME", "")
        if not os.access(os.path.expanduser("~"), os.W_OK):
            os.environ["HOME"] = "/tmp"

        try:
            svc = PaddleOCRService()
            svc.initialize()
            _ocr_instance = svc
            logger.info("PaddleOCR initialized successfully (singleton)")
        except Exception as e:
            logger.error("PaddleOCR initialization failed: %s", e)
            raise
        finally:
            if original_home:
                os.environ["HOME"] = original_home

        return _ocr_instance


class OCRPipeline:
    def __init__(self):
        self.llm = LLMClassifier(
            base_url=settings.LLM_BASE_URL,
            api_key=settings.LLM_API_KEY,
            model_name=settings.LLM_MODEL_NAME,
        )

    async def process(self, image_bytes: bytes) -> dict:
        ocr_result = self._recognize(image_bytes)
        fields = self._extract_fields(ocr_result)
        cat_result = self._categorize(fields, ocr_result.raw_text)

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
            svc = _get_ocr_service()
            return svc.recognize(image_bytes)
        except Exception as e:
            logger.error("OCR recognize failed: %s", e)
            return OCRResult(raw_text="", fields={}, confidence=0.0)

    def _extract_fields(self, ocr_result: OCRResult) -> dict:
        fields: dict = {}
        raw = ocr_result.raw_text

        if not raw:
            return fields

        core_result = extract_fields(raw)

        if core_result.merchant_name:
            fields["merchant_name"] = core_result.merchant_name

        if core_result.total_amount is not None:
            fields["amount"] = core_result.total_amount / 100.0

        if core_result.tax_amount is not None:
            fields["tax_amount"] = core_result.tax_amount / 100.0

        if core_result.invoice_date:
            fields["invoice_date"] = core_result.invoice_date

        return fields

    def _categorize(self, fields: dict, raw_text: str = "") -> CategorizeResult:
        return categorize_expense(
            merchant=fields.get("merchant_name"),
            text=raw_text,
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
        except Exception as e:
            logger.warning("LLM classify failed: %s", e)
            return None
