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

        kwargs: dict = {
            "use_textline_orientation": True,
            "lang": self._lang,
        }
        try:
            self._ocr = PaddleOCR(**kwargs)
        except TypeError:
            self._ocr = PaddleOCR(lang=self._lang)

    def recognize(self, image_bytes: bytes) -> OCRResult:
        if self._ocr is None:
            raise RuntimeError("PaddleOCRService not initialized, call initialize() first")

        import cv2
        import numpy as np
        import tempfile
        import os

        np_array = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
        if img is None:
            return OCRResult(raw_text="", fields={}, confidence=0.0)

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                tmp_path = f.name
                cv2.imwrite(tmp_path, img)

            if hasattr(self._ocr, "predict"):
                result = list(self._ocr.predict(tmp_path))
            else:
                result = self._ocr.ocr(tmp_path)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

        if not result:
            return OCRResult(raw_text="", fields={}, confidence=0.0)

        page = result[0]

        if hasattr(page, "rec_texts"):
            texts = list(page.rec_texts) if page.rec_texts else []
            scores = list(page.rec_scores) if page.rec_scores else []
        elif isinstance(page, dict) and "rec_texts" in page:
            texts = page.get("rec_texts", [])
            scores = page.get("rec_scores", [])
        elif isinstance(page, (list, tuple)):
            texts = []
            scores = []
            for line in page:
                if isinstance(line, (list, tuple)) and len(line) >= 2:
                    box, info = line
                    if isinstance(info, (list, tuple)) and len(info) >= 2:
                        texts.append(str(info[0]))
                        scores.append(float(info[1]))
        else:
            return OCRResult(raw_text="", fields={}, confidence=0.0)

        raw_text = "\n".join(texts)
        avg_confidence = sum(scores) / len(scores) if scores else 0.0
        fields: dict[str, str] = {"raw_text": raw_text}

        extracted = extract_fields(raw_text)

        return OCRResult(
            raw_text=raw_text,
            fields=fields,
            confidence=avg_confidence,
            extracted_fields=extracted,
        )
