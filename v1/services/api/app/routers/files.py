import hashlib
import os
import logging
import uuid
from pathlib import Path

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceFile, InvoiceRecord
from app.models.project import Project
from app.models.user import User
from app.services.dedup import find_duplicate_file
from app.services.invoice_writer import upsert_ocr_record
from app.services.storage import (
    UPLOAD_DIR,
    download_object,
    is_remote_configured,
    local_public_url,
    presigned_put_url,
    public_url,
    signed_url,
    upload_object,
)
from app.services.wx_security import check_image

router = APIRouter(prefix="/api", tags=["files"])

logger = logging.getLogger(__name__)

# 票据图片只接受这些类型。不做校验的话，任意文件（含可执行文件、超大文件）
# 都能上传进对象存储，既污染存储也带来后续处理风险。
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024

# 数电票归档：XML 是发票数据本体，OFD 是版式文件。两者都不做 OCR。
DOCUMENT_KIND_BY_MIME = {
    "text/xml": "xml",
    "application/xml": "xml",
    "application/ofd": "ofd",
}
DOCUMENT_KIND_BY_EXT = {".xml": "xml", ".ofd": "ofd"}
# XML 上限与 core 的 invoice_xml.MAX_XML_BYTES 对齐：超过这个体量的都不可能是数电票 XML
MAX_XML_BYTES = 5 * 1024 * 1024
MAX_OFD_BYTES = 20 * 1024 * 1024


def _classify_upload(filename: str, content_type: str) -> tuple[str, str]:
    """判定上传文件的内容类型与落盘扩展名，返回 (kind, ext)。

    仅靠 MIME 不可信（小程序/浏览器常给出 application/octet-stream），因此
    MIME 与扩展名两条路都认，任一路能确定类型就放行；都认不出才拒绝。
    """
    ext = Path(filename or "").suffix.lower()

    if content_type in ALLOWED_IMAGE_TYPES:
        return "image", ALLOWED_IMAGE_TYPES[content_type]
    if content_type in DOCUMENT_KIND_BY_MIME:
        kind = DOCUMENT_KIND_BY_MIME[content_type]
        return kind, ext if ext in DOCUMENT_KIND_BY_EXT else f".{kind}"
    if ext in DOCUMENT_KIND_BY_EXT:
        return DOCUMENT_KIND_BY_EXT[ext], ext
    if content_type in ("", "application/octet-stream") and ext in ALLOWED_IMAGE_EXTS:
        return "image", ext

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="仅支持 JPG / PNG / WebP / HEIC 票据图片，或数电票的 XML / OFD 文件",
    )


def _max_bytes(kind: str) -> int:
    if kind == "xml":
        return MAX_XML_BYTES
    if kind == "ofd":
        return MAX_OFD_BYTES
    return MAX_IMAGE_BYTES


@router.get("/files/upload-url")
async def get_upload_url(
    project_id: str,
    filename: str,
    content_type: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """签发「小程序直传 COS」的预签名地址。

    用于免域名的部署形态：小程序不把图片发给后端，而是拿这里返回的 URL
    直接 PUT 到对象存储，再调 /files/register 登记。签名由服务端算，
    小程序始终拿不到 SecretKey。
    """
    try:
        uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    if project_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if not is_remote_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前未配置对象存储，请改用 /api/files/upload 上传",
        )

    content_kind, ext = _classify_upload(filename or "", content_type or "")
    file_id = uuid.uuid4()
    file_key = f"uploads/{current_user.id}/{project_id}/{file_id}{ext}"
    expires = 900
    upload_url = presigned_put_url(file_key, expires=expires)
    if not upload_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="无法生成上传地址，请检查对象存储配置",
        )

    return {
        "file_id": str(file_id),
        "file_key": file_key,
        "upload_url": upload_url,
        "method": "PUT",
        "expires_in": expires,
        "content_kind": content_kind,
        "max_bytes": _max_bytes(content_kind),
    }


class RegisterUploadBody(BaseModel):
    """直传完成后的登记请求。"""

    project_id: str
    file_id: str
    file_key: str
    filename: str
    content_type: str = ""


@router.post("/files/register", status_code=status.HTTP_201_CREATED)
async def register_uploaded_file(
    body: RegisterUploadBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """登记已直传到对象存储的文件：校验归属 → 回源校验内容 → 建记录 → 触发 OCR。

    为什么要回源下载一次：内容安全检测与 SHA256 查重都需要真实字节。
    多一次约 1–2MB 的下载是可接受的代价，换来「违规图片不进库」和可靠的去重。
    """
    try:
        uuid.UUID(body.project_id)
        uuid.UUID(body.file_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project_result = await db.execute(
        select(Project).where(Project.id == body.project_id, Project.user_id == current_user.id)
    )
    if project_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # 关键：key 必须落在当前用户、当前项目的前缀下，否则可以借 key 读到他人文件
    expected_prefix = f"uploads/{current_user.id}/{body.project_id}/"
    if not body.file_key.startswith(expected_prefix):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="文件路径非法")

    try:
        content = download_object(body.file_key)
    except Exception as e:
        logger.warning("直传文件回源失败 key=%s: %s", body.file_key, e)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在，请重新上传")

    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="文件为空")

    content_kind, _ = _classify_upload(body.filename or "", body.content_type or "")
    max_bytes = _max_bytes(content_kind)
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"文件不得超过 {max_bytes // 1024 // 1024}MB",
        )

    if content_kind == "image":
        check = await check_image(content)
        if check.rejected:
            logger.warning("直传图片未通过内容安全检测: user=%s", current_user.id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="图片包含违规内容，请更换后重试",
            )

    file_hash = hashlib.sha256(content).hexdigest()
    duplicate_file = await find_duplicate_file(db, current_user.id, file_hash)

    file_url = public_url(body.file_key)
    invoice_file = InvoiceFile(
        id=uuid.UUID(body.file_id),
        project_id=body.project_id,
        user_id=current_user.id,
        file_url=file_url,
        file_key=body.file_key,
        source="upload",
        file_hash=file_hash,
        content_kind=content_kind,
        ocr_status="pending",
        parse_status="pending",
    )
    db.add(invoice_file)
    await db.commit()
    await db.refresh(invoice_file)

    parse_error = None
    quota_exceeded = False
    if content_kind == "xml":
        await upsert_xml_record(db, invoice_file, content, current_user)
        if invoice_file.parse_status == "blocked":
            quota_exceeded = True
        elif invoice_file.parse_status == "failed":
            parse_error = "XML 解析失败，原始文件已归档，可稍后重试或手工补录字段"
    else:
        # 图片走异步 OCR：与 /files/upload 保持同一触发方式
        try:
            from app.worker import process_ocr

            process_ocr.delay(str(invoice_file.id))
        except Exception as e:
            logger.warning("OCR 任务入队失败 file=%s: %s", invoice_file.id, e)

    return {
        "file_id": str(invoice_file.id),
        "file_url": invoice_file.file_url,
        "file_key": invoice_file.file_key,
        "filename": body.filename,
        "content_type": body.content_type,
        "content_kind": invoice_file.content_kind,
        "ocr_status": invoice_file.ocr_status,
        "parse_status": invoice_file.parse_status,
        "is_duplicate_file": duplicate_file is not None,
        "duplicate_file_id": str(duplicate_file.id) if duplicate_file else None,
        "quota_exceeded": quota_exceeded,
        "message": parse_error,
    }


@router.post("/files/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(
    project_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # 归属校验：否则可以把文件挂到他人项目下
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id, Project.user_id == current_user.id
        )
    )
    if project_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    content_kind, ext = _classify_upload(file.filename or "", file.content_type or "")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="文件为空")
    max_bytes = _max_bytes(content_kind)
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"文件不得超过 {max_bytes // 1024 // 1024}MB",
        )

    # 内容安全：用户上传的票据图片属 UGC，提审要求接入微信检测。
    # 只挡「微信明确判定违规」的情况；检测不可用时放行（详见 wx_security 说明）。
    # XML/OFD 是文档不是图片，交给图片检测接口只会在微信侧报错，因此跳过。
    if content_kind == "image":
        check = await check_image(content)
        if check.rejected:
            logger.warning("票据图片未通过内容安全检测: user=%s", current_user.id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="图片包含违规内容，请更换后重试",
            )

    file_id = uuid.uuid4()
    local_filename = f"{file_id}{ext}"
    user_dir = UPLOAD_DIR / str(current_user.id) / str(project_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    (user_dir / local_filename).write_bytes(content)

    # OSS/COS 对象键带 uploads/ 前缀；本地静态目录直接挂在 uploads 上，
    # 因此本地 URL 不能再带这一段，否则会 404。
    file_key = f"uploads/{current_user.id}/{project_id}/{local_filename}"
    local_url = local_public_url(file_key)

    if is_remote_configured():
        try:
            file_url = upload_object(file_key, content)
        except Exception as e:
            logger.warning("对象存储上传失败，回退本地存储: %s", e)
            file_url = local_url
    else:
        file_url = local_url

    # 文件级查重：同一份原始文件被重复上传。比发票号码查重更可靠——号码要 OCR
    # 读出来才有效，而哈希是上传那一刻就有的。
    file_hash = hashlib.sha256(content).hexdigest()
    duplicate_file = await find_duplicate_file(db, current_user.id, file_hash)

    invoice_file = InvoiceFile(
        id=file_id,
        project_id=project_id,
        user_id=current_user.id,
        file_url=file_url,
        file_key=file_key,
        source="upload",
        file_hash=file_hash,
        content_kind=content_kind,
        ocr_status="pending",
        parse_status="pending",
    )
    db.add(invoice_file)
    await db.commit()
    await db.refresh(invoice_file)

    parse_error = None
    quota_exceeded = False

    if content_kind == "xml":
        # 数电票 XML 无需 OCR，直接解析即可，比走异步任务链路快得多。
        # 解析失败也**不回滚文件**：归档原件是数电票的硬性要求，解析只是附赠。
        await upsert_xml_record(db, invoice_file, content, current_user)
        if invoice_file.parse_status == "blocked":
            quota_exceeded = True
        elif invoice_file.parse_status == "failed":
            parse_error = "XML 解析失败，原始文件已归档，可稍后重试或手工补录字段"

    return {
        "file_id": str(invoice_file.id),
        "file_url": invoice_file.file_url,
        "file_key": invoice_file.file_key,
        "filename": file.filename,
        "content_type": file.content_type,
        "content_kind": invoice_file.content_kind,
        "ocr_status": invoice_file.ocr_status,
        "parse_status": invoice_file.parse_status,
        "is_duplicate_file": duplicate_file is not None,
        "duplicate_file_id": str(duplicate_file.id) if duplicate_file else None,
        "quota_exceeded": quota_exceeded,
        "message": parse_error,
    }


async def upsert_xml_record(
    db: AsyncSession, invoice_file: InvoiceFile, content: bytes, user: User
) -> None:
    """解析数电票 XML 并写库。失败只标状态、不抛异常，避免整条归档链路失败。"""
    from piaoxiaozhu_core.invoice_xml import XMLParseError, parse_einvoice_xml

    # 解析同样算一次「识别」，与 OCR 共用同一份月度额度：数电票归档是付费权益，
    # 额度用完时先归档文件、暂停解析，用户升级后重传即可解析出来。
    # 与 OCR 一致走「按到期时间惰性判定」的有效套餐，而不是库里存的 plan_code。
    # 积分制：数电票解析同样算一次识别消耗；余额不足时先归档、暂停解析，
    # 用户补足积分后重试即可解析出来（与旧「额度耗尽」时的降级行为一致）。
    from app.services import points as points_svc

    try:
        await points_svc.consume(
            db,
            invoice_file.user_id,
            points_svc.COST_INVOICE_OCR,
            points_svc.ACTION_CONSUME_OCR,
            "数电票解析",
        )
    except points_svc.InsufficientPoints:
        invoice_file.ocr_status = "pending"
        invoice_file.parse_status = "blocked"
        await db.commit()
        return

    try:
        parsed = parse_einvoice_xml(content)
    except XMLParseError as e:
        logger.warning("数电票 XML 解析失败: file=%s err=%s", invoice_file.id, e)
        invoice_file.ocr_status = "failed"
        invoice_file.parse_status = "failed"
        await db.commit()
        return
    except Exception:
        logger.exception("数电票 XML 解析异常: file=%s", invoice_file.id)
        invoice_file.ocr_status = "failed"
        invoice_file.parse_status = "failed"
        await db.commit()
        return

    await upsert_ocr_record(db, invoice_file, parsed)
    invoice_file.ocr_status = "done"
    invoice_file.parse_status = "done"
    await db.commit()


@router.post("/ocr/parse")
async def trigger_ocr_parse(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_id = body.get("file_id")
    if not file_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_id is required")
    # 非法 UUID 直接 404：否则会被丢给 PostgreSQL 的 uuid 类型比较，抛出
    # InvalidTextRepresentation 变成 500，而不是预期的「文件不存在」。
    try:
        uuid.UUID(str(file_id))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    result = await db.execute(
        select(InvoiceFile).where(
            InvoiceFile.id == file_id,
            InvoiceFile.user_id == current_user.id,
        )
    )
    invoice_file = result.scalar_one_or_none()
    if invoice_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    if invoice_file.ocr_status == "processing":
        return {
            "file_id": str(invoice_file.id),
            "status": "processing",
            "message": "OCR already in progress",
        }

    # 积分制：识别一张票扣 COST_INVOICE_OCR 积分（取代原来的「套餐月度张数」限制）。
    # 先扣后跑：避免「识别完了没付账」；识别失败目前不自动退款（与旧额度的消耗口径一致），
    # 若后续要做自动退款，应在 worker 里按 file_id 补发。
    from app.services import points as points_svc

    try:
        await points_svc.consume(
            db,
            current_user.id,
            points_svc.COST_INVOICE_OCR,
            points_svc.ACTION_CONSUME_OCR,
            "票据识别",
        )
    except points_svc.InsufficientPoints as e:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"积分不足：识别一张票需 {e.required} 积分，当前 {e.balance}。"
                "可通过每日签到或购买套餐获取积分。"
            ),
        )

    invoice_file.ocr_status = "processing"
    await db.commit()

    try:
        from app.worker import process_ocr

        task = process_ocr.delay(str(invoice_file.id))
        task_id = task.id
    except Exception:
        # 兜底：Redis/Celery 不可用时同步跑一次 OCR。拆分镜像后 api 可能不带
        # paddle 依赖，必须显式处理，否则这里会抛 ImportError 变成 500。
        try:
            from app.services.ocr_service import OCRPipeline
        except ImportError as e:
            logger.error("同步 OCR 兜底不可用（api 镜像未装 OCR 依赖）: %s", e)
            invoice_file.ocr_status = "failed"
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="识别服务暂时不可用，请稍后重试",
            ) from e

        pipeline = OCRPipeline()
        try:
            image_bytes = download_object(invoice_file.file_key)
            ocr_result = await pipeline.process(image_bytes)
            await upsert_ocr_record(db, invoice_file, ocr_result)
            invoice_file.ocr_status = "done"
            invoice_file.parse_status = "done"
            await db.commit()
        except FileNotFoundError:
            invoice_file.ocr_status = "failed"
            await db.commit()
            logger.error("File content not found for OCR: %s", invoice_file.file_key)
        except Exception as e:
            invoice_file.ocr_status = "failed"
            await db.commit()
            logger.error("OCR processing failed: %s", e)

        task_id = "sync"

    return {
        "task_id": task_id,
        "file_id": str(invoice_file.id),
        "status": "processing",
        "message": "OCR task submitted",
    }


@router.get("/ocr/status/{file_id}")
async def get_ocr_status(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 非法 UUID 直接 404，避免落到 PostgreSQL 的 uuid 比较上抛 500
    try:
        uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    result = await db.execute(
        select(InvoiceFile).where(
            InvoiceFile.id == file_id,
            InvoiceFile.user_id == current_user.id,
        )
    )
    invoice_file = result.scalar_one_or_none()
    if invoice_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    records_result = await db.execute(
        select(InvoiceRecord)
        .where(
            InvoiceRecord.file_id == file_id,
            InvoiceRecord.user_id == current_user.id,
        )
        .order_by(InvoiceRecord.created_at.desc())
    )
    records = records_result.scalars().all()

    return {
        "file_id": str(invoice_file.id),
        "ocr_status": invoice_file.ocr_status,
        "parse_status": invoice_file.parse_status,
        "records_count": len(records),
        "records": [
            {
                "id": str(r.id),
                "file_id": str(r.file_id) if r.file_id else None,
                "direction": r.direction,
                "merchant_name": r.merchant_name,
                "amount": float(r.amount) if r.amount is not None else None,
                "tax_amount": float(r.tax_amount) if r.tax_amount is not None else None,
                "invoice_date": r.invoice_date,
                "category_code": r.category_code,
                "category_l1": r.category_l1,
                "category_l2": r.category_l2,
                "confidence": float(r.confidence) if r.confidence is not None else None,
            }
            for r in records
        ],
    }


@router.get("/files/signed-url/{file_id}")
async def get_signed_url(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 非法 UUID 直接 404，避免落到 PostgreSQL 的 uuid 比较上抛 500
    try:
        uuid.UUID(file_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    result = await db.execute(
        select(InvoiceFile).where(
            InvoiceFile.id == file_id,
            InvoiceFile.user_id == current_user.id,
        )
    )
    invoice_file = result.scalar_one_or_none()
    if invoice_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    if is_remote_configured():
        url = signed_url(invoice_file.file_key)
        if url:
            return {"url": url}

    return {"url": invoice_file.file_url}
