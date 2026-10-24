from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from piaoxiaozhu_core.invoice_identity import invoice_fingerprint_with_strength

from app.models.invoice import InvoiceFile, InvoiceRecord
from app.services.dedup import find_duplicate_record
from app.services.invoice_verify import verify_record


async def upsert_ocr_record(
    db: AsyncSession,
    invoice_file: InvoiceFile,
    ocr_result: dict,
) -> InvoiceRecord:
    """按 file_id 幂等写入识别结果（OCR 或数电票 XML 解析）。

    同一张票据会被识别两次：用户重复点「重新识别」、Celery 任务重试、
    以及同步兜底与异步任务撞车。若每次都新建记录，记录数会翻倍、
    报表支出也会翻倍，用户看到的是「一次上传两条支出」。
    因此这里先查（同文件 + 同用户）已有的记录，有则原地更新。

    写入之后顺带做两件事，它们是同一条链路上的必要衔接：
    - **算指纹并判重**：没有这一步，号码读出来了也白读，用户照样重复记账。
    - **跑票面结构自检**：纯本地计算，放到这里可以让用户上传即见结果，
      不必再单独点一次。
    """
    cat_result = ocr_result.get("categorize")

    fields = {
        "project_id": invoice_file.project_id,
        "user_id": invoice_file.user_id,
        "direction": "out",
        "merchant_name": ocr_result.get("merchant_name"),
        "amount": ocr_result.get("amount"),
        "tax_amount": ocr_result.get("tax_amount"),
        "invoice_date": ocr_result.get("invoice_date"),
        "invoice_code": ocr_result.get("invoice_code"),
        "invoice_no": ocr_result.get("invoice_no"),
        # OCR 链路与 XML 链路对销方税号的键名不同，这里统一收口
        "tax_no": ocr_result.get("tax_no") or ocr_result.get("seller_tax_no"),
        "category_code": cat_result.category_code if cat_result else "other",
        "category_l1": cat_result.category_l1 if cat_result else "其他",
        "category_l2": cat_result.category_l2 if cat_result else "",
        "confidence": cat_result.confidence if cat_result else 0.0,
        "raw_text": ocr_result.get("raw_text"),
        # reason 一列承载「给用户看的解释」：分类理由，或非票据提示。
        # 非票据提示优先——它比分类理由更该被看见。
        "reason": (
            ocr_result.get("invoice_warning")
            or (cat_result.reason if cat_result else "")
        ),
    }

    result = await db.execute(
        select(InvoiceRecord).where(
            InvoiceRecord.file_id == invoice_file.id,
            InvoiceRecord.user_id == invoice_file.user_id,
        )
    )
    record = result.scalars().first()

    if record is None:
        record = InvoiceRecord(file_id=invoice_file.id, **fields)
        db.add(record)
    else:
        for key, value in fields.items():
            setattr(record, key, value)

    # 先 flush 拿到 id：判重时必须把自己排除掉，否则新记录会把自己判成重复。
    await db.flush()

    await apply_identity_and_verify(db, record)
    return record


async def apply_identity_and_verify(db: AsyncSession, record: InvoiceRecord) -> None:
    """算查重指纹、判重、跑票面自检。字段被人工改过时也应重跑，故单独抽出。"""
    amount_cents: Optional[int] = None
    if record.amount is not None:
        amount_cents = int(round(float(record.amount) * 100))

    fingerprint = invoice_fingerprint_with_strength(
        invoice_type=None,
        invoice_code=record.invoice_code,
        invoice_no=record.invoice_no,
        seller_tax_no=record.tax_no,
        invoice_date=record.invoice_date,
        total_amount_cents=amount_cents,
    )
    if fingerprint is None:
        record.invoice_fingerprint = None
        record.fingerprint_strength = None
        record.duplicate_of = None
    else:
        record.invoice_fingerprint, record.fingerprint_strength = fingerprint
        duplicate = await find_duplicate_record(
            db, record.user_id, record.invoice_fingerprint, exclude_record_id=record.id
        )
        record.duplicate_of = duplicate.id if duplicate else None

    await verify_record(record, db)
