import asyncio
import logging

from celery import Celery
from celery.schedules import crontab

from app.config import settings

logger = logging.getLogger(__name__)

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
    # 定时任务只在这里登记，实际触发需要另起 `celery -A app.worker beat` 进程
    # （本地见 infra/docker-compose.yml 的 beat 服务，生产云托管需单独部署一个）。
    # 到期提醒依赖它；但**到期降级不依赖调度**，读取时惰性判定（见 services/subscription.py），
    # 因此 beat 挂掉不会导致用户白嫖或提前降级。
    beat_schedule={
        "subscription-expiry-reminder": {
            "task": "app.worker.remind_subscription_expiry",
            # 每天 10:00（Asia/Shanghai）扫一次：用户白天更容易看到并顺手续费
            "schedule": crontab(hour=10, minute=0),
        }
    },
)


@celery_app.task(bind=True, max_retries=3)
def process_ocr(self, file_id: str):
    from sqlalchemy import select

    from app.models.database import AsyncSessionLocal, engine
    from app.models.invoice import InvoiceFile
    from app.services.invoice_writer import upsert_ocr_record
    from app.services.ocr_service import OCRPipeline
    from app.services.storage import download_object

    async def _mark_failed(db):
        # rollback 之后对象已过期，必须重新查一次再改状态
        result = await db.execute(select(InvoiceFile).where(InvoiceFile.id == file_id))
        invoice_file = result.scalar_one_or_none()
        if invoice_file is not None:
            invoice_file.ocr_status = "failed"
            await db.commit()

    async def _run():
        # 一个任务只建一个事件循环、一个 session。engine 的连接池绑定在
        # 建池时的 loop 上，跨 loop 复用会报 "Future attached to a different
        # loop" / "another operation is in progress"；任务结束再 dispose，
        # 避免常驻 worker 复用上一个任务 loop 上的连接。
        try:
            async with AsyncSessionLocal() as db:
                try:
                    result = await db.execute(
                        select(InvoiceFile).where(InvoiceFile.id == file_id)
                    )
                    invoice_file = result.scalar_one_or_none()
                    if invoice_file is None:
                        return {"status": "error", "message": "File not found"}

                    if invoice_file.ocr_status == "done":
                        return {"status": "skipped", "message": "Already processed"}

                    # 必须通过存储层读取：配了对象存储（OSS/COS）后文件不在 worker 的
                    # 本地磁盘上，直接读 uploads/ 会让 OCR 在生产环境全线失败。
                    image_bytes = download_object(invoice_file.file_key)

                    pipeline = OCRPipeline()
                    ocr_result = await pipeline.process(image_bytes)

                    record = await upsert_ocr_record(db, invoice_file, ocr_result)

                    invoice_file.ocr_status = "done"
                    invoice_file.parse_status = "done"
                    await db.commit()

                    return {
                        "status": "done",
                        "file_id": file_id,
                        "record_id": str(record.id),
                    }
                except FileNotFoundError:
                    await db.rollback()
                    await _mark_failed(db)
                    return {"status": "error", "message": "File not found in storage"}
                except Exception:
                    # 必须在「同一个 loop、同一个 session」内先把状态标成 failed 并
                    # 提交，否则文件会永久停在 processing，用户重试会被
                    # "already in progress" 永久挡回。
                    await db.rollback()
                    try:
                        await _mark_failed(db)
                    except Exception:
                        logger.exception("标记 OCR 失败状态时出错: file_id=%s", file_id)
                    raise
        finally:
            await engine.dispose()

    try:
        return asyncio.run(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)


@celery_app.task
def remind_subscription_expiry():
    """套餐到期提醒，由 beat 每天触发一次。

    与 process_ocr 遵循同样的约束：一个任务建一个事件循环、一个 session，
    结束时 dispose engine（连接池绑定在建立它的 loop 上）。

    不设重试：整批扫描失败只影响当天的提醒，beat 明天还会再跑；失败日志
    足够定位问题，而重试会把微信接口的报错放大成多轮请求。
    """
    from app.models.database import AsyncSessionLocal, engine
    from app.services.subscription_reminder import run_expiry_reminders

    async def _run():
        try:
            async with AsyncSessionLocal() as db:
                return await run_expiry_reminders(db)
        finally:
            await engine.dispose()

    return asyncio.run(_run())
