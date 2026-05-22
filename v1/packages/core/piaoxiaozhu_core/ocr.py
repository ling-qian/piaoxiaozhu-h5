from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from piaoxiaozhu_core.field_extractor import ExtractedFields, extract_fields


@dataclass(frozen=True)
class OCRResult:
    raw_text: str
    fields: dict[str, str]
    confidence: float
    extracted_fields: Optional[ExtractedFields] = None


class PaddleOCRService:
    def __init__(self, lang: str = "ch", use_gpu: bool = False) -> None:
        self._lang = lang
        self._use_gpu = use_gpu
        self._ocr: object | None = None

    def initialize(self) -> None:
        from paddleocr import PaddleOCR

        self._ocr = PaddleOCR(
            use_angle_cls=True,
            lang=self._lang,
            use_gpu=self._use_gpu,
            show_log=False,
        )

    def recognize(self, image_bytes: bytes) -> OCRResult:
        if self._ocr is None:
            raise RuntimeError("PaddleOCRService 未初始化，请先调用 initialize()")

        import numpy as np

        np_array = np.frombuffer(image_bytes, dtype=np.uint8)
        result = self._ocr.ocr(np_array, cls=True)

        if not result or not result[0]:
            return OCRResult(raw_text="", fields={}, confidence=0.0)

        texts: list[str] = []
        confidences: list[float] = []
        fields: dict[str, str] = {}

        for line in result[0]:
            box, (text, confidence) = line
            texts.append(text)
            confidences.append(confidence)

        raw_text = "\n".join(texts)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        fields["raw_text"] = raw_text

        extracted = extract_fields(raw_text)

        return OCRResult(
            raw_text=raw_text,
            fields=fields,
            confidence=avg_confidence,
            extracted_fields=extracted,
        )
