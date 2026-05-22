import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceFile, InvoiceRecord
from app.models.user import User

router = APIRouter(prefix="/api", tags=["files"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/files/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(
    project_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_id = uuid.uuid4()
    user_dir = UPLOAD_DIR / str(current_user.id) / str(project_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "unknown").suffix
    local_filename = f"{file_id}{ext}"
    local_path = user_dir / local_filename

    content = await file.read()
    with open(local_path, "wb") as f:
        f.write(content)

    file_key = f"uploads/{current_user.id}/{project_id}/{local_filename}"

    if settings.OSS_ACCESS_KEY_ID:
        import oss2

        auth = oss2.Auth(settings.OSS_ACCESS_KEY_ID, settings.OSS_ACCESS_KEY_SECRET)
        bucket = oss2.Bucket(auth, settings.OSS_ENDPOINT, settings.OSS_BUCKET_NAME)
        bucket.put_object(file_key, content)
        file_url = f"https://{settings.OSS_BUCKET_NAME}.{settings.OSS_ENDPOINT}/{file_key}"
    else:
        file_url = f"/files/static/{file_key}"

    invoice_file = InvoiceFile(
        id=file_id,
        project_id=project_id,
        user_id=current_user.id,
        file_url=file_url,
        file_key=file_key,
        source="upload",
        ocr_status="pending",
        parse_status="pending",
    )
    db.add(invoice_file)
    await db.commit()
    await db.refresh(invoice_file)

    return {
        "file_id": str(invoice_file.id),
        "file_url": invoice_file.file_url,
        "file_key": invoice_file.file_key,
        "filename": file.filename,
        "content_type": file.content_type,
        "ocr_status": invoice_file.ocr_status,
    }


@router.post("/ocr/parse")
async def trigger_ocr_parse(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_id = body.get("file_id")
    if not file_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_id is required")

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

    invoice_file.ocr_status = "processing"
    await db.commit()

    try:
        from app.worker import process_ocr

        task = process_ocr.delay(str(invoice_file.id))
        task_id = task.id
    except Exception:
        from app.services.ocr_service import OCRPipeline

        pipeline = OCRPipeline()
        local_path = UPLOAD_DIR / invoice_file.file_key.replace("uploads/", "")
        if local_path.exists():
            image_bytes = local_path.read_bytes()
            ocr_result = await pipeline.process(image_bytes)
            cat_result = ocr_result.get("categorize")

            record = InvoiceRecord(
                project_id=invoice_file.project_id,
                file_id=invoice_file.id,
                user_id=current_user.id,
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
        select(InvoiceRecord).where(
            InvoiceRecord.file_id == file_id,
            InvoiceRecord.user_id == current_user.id,
        )
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
