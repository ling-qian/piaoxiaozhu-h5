from __future__ import annotations

import logging
import os
import threading
from typing import Optional

from piaoxiaozhu_core.ocr import PaddleOCRService, OCRResult
from piaoxiaozhu_core.categorize import categorize_expense, CategorizeResult
from piaoxiaozhu_core.field_extractor import extract_fields
from piaoxiaozhu_core.llm import LLMClassifier, LLMFieldCorrector
from piaoxiaozhu_core.receipt_lines import cross_check as check_receipt_lines

from app.config import settings

logger = logging.getLogger(__name__)


def _to_float(value) -> Optional[float]:
    """把 OCR 出来的金额（可能是 '¥19.30' / '1,280.00' / None）转成 float。

    不直接 float() 是因为 OCR 结果带符号与千分位，
    而这些值来自识别而不是用户输入，转换失败应当返回 None 而不是抛异常。
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).replace(",", "").replace("¥", "").replace("￥", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


class OCRUnavailableError(RuntimeError):
    """OCR 引擎不可用，或没能从图片中识别出任何文字。

    调用方必须据此把该文件标记为 failed，而不是照常写入一条字段全空的记录：
    否则用户既消耗了识别额度，又拿到一条看起来「已识别」的无效数据。
    """


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
        _llm_kwargs = dict(
            base_url=settings.LLM_BASE_URL,
            api_key=settings.LLM_API_KEY,
            model_name=settings.LLM_MODEL_NAME,
        )
        self.llm = LLMClassifier(**_llm_kwargs)
        self.corrector = LLMFieldCorrector(**_llm_kwargs)

    async def process(self, image_bytes: bytes) -> dict:
        ocr_result = self._recognize(image_bytes)
        fields = self._extract_fields(ocr_result)

        # 字段纠错：只在「看起来有问题」时才调模型，避免每张票都产生费用。
        # 判据取最容易出错且一旦出错影响最大的几处：金额/日期/商户名为空，
        # 或整体识别置信度偏低。
        if settings.LLM_API_KEY and self._needs_correction(fields, ocr_result.confidence):
            try:
                fixed = self.corrector.correct_fields(ocr_result.raw_text, fields)
                if fixed.corrections:
                    logger.info(
                        "LLM 字段纠错 %d 处: %s",
                        len(fixed.corrections),
                        {k: f"{fields.get(k)} → {v}" for k, v in fixed.corrections.items()},
                    )
                    fields.update(fixed.corrections)
            except Exception as e:
                # 纠错是增强项，失败必须退回原始字段，不能影响出票
                logger.warning("LLM 字段纠错失败，沿用原始字段: %s", e)

        # 非票据拦截：先用关键词粗筛，只有「不像发票」时才请模型确认，
        # 避免每张正常票据都多付一次模型费用。误判方向偏向放过——
        # 把正常票据判成非票据，比漏判更伤用户。
        is_invoice = True
        invoice_warning = None
        if not self._has_invoice_signals(ocr_result.raw_text):
            if settings.LLM_API_KEY:
                is_invoice = self.corrector.is_invoice(ocr_result.raw_text)
            else:
                is_invoice = False
            if not is_invoice:
                invoice_warning = "看起来不像发票，字段可能不准，建议核对或重新拍摄"
                logger.info("非票据拦截：OCR 文本缺少发票特征，已标记")

        # 小票专属校验：明细行加总 vs 合计。
        # 只在小票场景做——发票有税额可以校验税率关系，不需要这套；
        # 小票没有税额，这是唯一能发现「合计读错」的手段。
        line_check = None
        if is_invoice and not fields.get("invoice_no") and not fields.get("invoice_code"):
            try:
                line_check = check_receipt_lines(
                    ocr_result.raw_text, _to_float(fields.get("amount"))
                )
                if not line_check.ok:
                    logger.info("小票明细对账不一致: %s", line_check.message)
                    invoice_warning = (
                        f"{invoice_warning}；{line_check.message}" if invoice_warning else line_check.message
                    )
            except Exception as e:
                logger.warning("小票明细对账失败，跳过: %s", e)

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
            # 票据身份字段要一路带到写库层：查重与票面自检都靠它们，
            # 在这里丢掉的话后面再准的规则也没有输入。
            "invoice_code": fields.get("invoice_code"),
            "invoice_no": fields.get("invoice_no"),
            "tax_no": fields.get("seller_tax_no"),
            "categorize": cat_result,
            "is_invoice": is_invoice,
            "invoice_warning": invoice_warning,
            "line_check": line_check.to_dict() if line_check else None,
        }

    # 凭证的强特征词。除了发票类，必须覆盖小票类——超市/餐饮小票没有发票代码和税号，
    # 若只按发票特征判定，大量正常小票会被判成「非票据」而误报。
    _INVOICE_SIGNALS = (
        # 发票类
        "发票", "税号", "价税", "开票", "销售方", "购买方", "税率",
        # 小票/收据类
        "小票", "收银", "收据", "合计", "金额", "实收", "找零", "应付", "实付",
        "单价", "数量", "总计", "谢谢惠顾", "订单号",
    )

    @classmethod
    def _has_invoice_signals(cls, raw_text: str) -> bool:
        if not raw_text:
            return False
        # 门槛设为 1：小票常常只有「合计」一个特征词，卡 2 个会大面积误判
        return any(s in raw_text for s in cls._INVOICE_SIGNALS)

    @staticmethod
    def _needs_correction(fields: dict, ocr_confidence: float) -> bool:
        """是否需要调模型校正字段。

        刻意保守：只有「缺字段」或「整体置信度低」才触发。
        目的是把调用量压到真正需要的那些票上——正常票据不该产生额外费用。
        """
        if ocr_confidence is not None and ocr_confidence < 0.85:
            return True
        if not fields.get("amount"):
            return True
        if not fields.get("invoice_date"):
            return True
        if not fields.get("merchant_name"):
            return True
        return False

    def _recognize(self, image_bytes: bytes) -> OCRResult:
        try:
            svc = _get_ocr_service()
            result = svc.recognize(image_bytes)
        except Exception as e:
            # 这里曾吞掉异常返回空结果，于是初始化失败的图片仍被打上 done、
            # 并写入一条字段全空的记录，故障只剩一行日志，无从追查。
            logger.error("OCR recognize failed: %s", e)
            raise OCRUnavailableError(f"OCR 识别失败: {e}") from e

        if not (result.raw_text or "").strip():
            # 图片无法解码，或模型没有检测到任何文字。对票据识别来说这是失败，
            # 不是「成功但内容为空」，不能当成正常结果写库。
            logger.error("OCR produced empty text for image of %d bytes", len(image_bytes))
            raise OCRUnavailableError("未识别出任何文字，图片可能不清晰或不是票据")

        return result

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

        if core_result.invoice_code:
            fields["invoice_code"] = core_result.invoice_code

        if core_result.invoice_no:
            fields["invoice_no"] = core_result.invoice_no

        if core_result.seller_tax_no:
            fields["seller_tax_no"] = core_result.seller_tax_no

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
