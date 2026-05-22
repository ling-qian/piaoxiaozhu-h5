import uuid

from fastapi import APIRouter, Depends, UploadFile, File

from app.config import settings
from app.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api", tags=["files"])


@router.post("/files/upload")
async def upload_file(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    file_id = str(uuid.uuid4())
    file_key = f"uploads/{current_user.id}/{file_id}/{file.filename}"

    if settings.OSS_ACCESS_KEY_ID:
        import oss2

        auth = oss2.Auth(settings.OSS_ACCESS_KEY_ID, settings.OSS_ACCESS_KEY_SECRET)
        bucket = oss2.Bucket(auth, settings.OSS_ENDPOINT, settings.OSS_BUCKET_NAME)
        content = await file.read()
        bucket.put_object(file_key, content)
        file_url = f"https://{settings.OSS_BUCKET_NAME}.{settings.OSS_ENDPOINT}/{file_key}"
    else:
        file_url = f"https://mock-oss.example.com/{file_key}"

    return {
        "file_id": file_id,
        "file_url": file_url,
        "file_key": file_key,
        "filename": file.filename,
        "content_type": file.content_type,
    }


@router.post("/ocr/parse")
async def trigger_ocr_parse(body: dict, current_user: User = Depends(get_current_user)):
    file_id = body.get("file_id")
    task_id = str(uuid.uuid4())
    return {
        "task_id": task_id,
        "file_id": file_id,
        "status": "processing",
        "message": "OCR task submitted",
    }


@router.get("/ocr/status/{file_id}")
async def get_ocr_status(file_id: str, current_user: User = Depends(get_current_user)):
    return {
        "file_id": file_id,
        "ocr_status": "completed",
        "parse_status": "completed",
        "records_count": 3,
    }
