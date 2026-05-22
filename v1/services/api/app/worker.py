from celery import Celery
from sqlalchemy import select

from app.config import settings

celery_app = Celery(
    "piaoxiaozhu",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
)


@celery_app.task(bind=True, max_retries=3)
def process_ocr(self, file_id: str):
    from app.models.database import AsyncSessionLocal
    from app.models.invoice import InvoiceFile, InvoiceRecord
    from app.services.ocr_service import OCRPipeline
    from pathlib import Path

    import asyncio

    async def _run():
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(InvoiceFile).where(InvoiceFile.id == file_id)
            )
            invoice_file = result.scalar_one_or_none()
            if invoice_file is None:
                return {"status": "error", "message": "File not found"}

            if invoice_file.ocr_status == "done":
                return {"status": "skipped", "message": "Already processed"}

            local_path = Path("uploads") / invoice_file.file_key.replace("uploads/", "")
            if not local_path.exists():
                invoice_file.ocr_status = "error"
                await db.commit()
                return {"status": "error", "message": "File not found on disk"}

            image_bytes = local_path.read_bytes()

            pipeline = OCRPipeline()
            ocr_result = await pipeline.process(image_bytes)

            cat_result = ocr_result.get("categorize")

            record = InvoiceRecord(
                project_id=invoice_file.project_id,
                file_id=invoice_file.id,
                user_id=invoice_file.user_id,
                direction="out",
                merchant_name=ocr_result.get("merchant_name"),
                amount=ocr_result.get("amount"),
                tax_amount=ocr_result.get("tax_amount"),
                invoice_date=ocr_result.get("invoice_date"),
                category_code=cat_result.category_code if cat_result else "other",
                category_l1=cat_result.category_l1 if cat_result else "其他",
                category_l2=cat_result.category_l2 if cat_result else "",
                confidence=cat_result.confidence if cat_result else 0.0,
                raw_text=ocr_result.get("raw_text"),
                reason=cat_result.reason if cat_result else "",
            )
            db.add(record)

            invoice_file.ocr_status = "done"
            invoice_file.parse_status = "done"
            await db.commit()

            return {
                "status": "done",
                "file_id": file_id,
                "record_id": str(record.id),
            }

    try:
        return asyncio.run(_run())
    except Exception as exc:
        from app.models.database import AsyncSessionLocal
        from app.models.invoice import InvoiceFile

        async def _mark_error():
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(InvoiceFile).where(InvoiceFile.id == file_id)
                )
                invoice_file = result.scalar_one_or_none()
                if invoice_file is not None:
                    invoice_file.ocr_status = "error"
                    await db.commit()

        asyncio.run(_mark_error())
        raise self.retry(exc=exc, countdown=30)
