from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import json
import uuid

from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceRecord
from app.models.project import Project
from app.models.user import User
from app.schemas.record import InvoiceRecordCreate, InvoiceRecordUpdate, InvoiceRecordResponse
from app.services.invoice_verify import verify_record
from app.services.invoice_writer import apply_identity_and_verify

router = APIRouter(prefix="/api", tags=["records"])


def _validate_uuid(value: str, name: str = "resource"):
    try:
        uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{name} not found")


def _record_payload(record: InvoiceRecord) -> dict:
    """记录的统一输出结构。三处接口（列表/详情/创建后）共用，避免字段加漏。

    verify_detail 里存的是自检明细 JSON，这里解析回对象；存进去时是我们的代码
    序列化的，解析失败说明数据被外部改动过，此时退化为 None 而不是抛出 500。
    """
    detail = None
    if record.verify_detail:
        try:
            detail = json.loads(record.verify_detail)
        except (TypeError, ValueError):
            detail = None

    return {
        "id": str(record.id),
        "project_id": str(record.project_id),
        "file_id": str(record.file_id) if record.file_id else None,
        "user_id": str(record.user_id),
        "direction": record.direction,
        "merchant_name": record.merchant_name,
        "tax_no": record.tax_no,
        "amount": float(record.amount) if record.amount is not None else None,
        "tax_amount": float(record.tax_amount) if record.tax_amount is not None else None,
        "invoice_date": record.invoice_date,
        "invoice_code": record.invoice_code,
        "invoice_no": record.invoice_no,
        "category_code": record.category_code,
        "category_l1": record.category_l1,
        "category_l2": record.category_l2,
        "confidence": float(record.confidence) if record.confidence is not None else None,
        "raw_text": record.raw_text,
        "reason": record.reason,
        "is_manual_corrected": record.is_manual_corrected,
        "duplicate_of": str(record.duplicate_of) if record.duplicate_of else None,
        "is_duplicate": record.duplicate_of is not None,
        "fingerprint_strength": record.fingerprint_strength,
        "verify_status": record.verify_status,
        "verify_detail": detail,
        "verify_checked_at": (
            record.verify_checked_at.isoformat() if record.verify_checked_at else None
        ),
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }


@router.get("/projects/{project_id}/records")
async def list_records(
    project_id: str,
    direction: Optional[str] = None,
    category_code: Optional[str] = None,
    category_l1: Optional[str] = None,
    keyword: Optional[str] = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _validate_uuid(project_id, "Project")
    query = select(InvoiceRecord).where(
        InvoiceRecord.project_id == project_id,
        InvoiceRecord.user_id == current_user.id,
    )

    if direction:
        query = query.where(InvoiceRecord.direction == direction)
    if category_code:
        query = query.where(InvoiceRecord.category_code == category_code)
    # 前端分类筛选按「用户看得见的一级分类名」来，而不是派生的 category_code——
    # stats 接口里的 category_code 是从 category_l1 映射出来的，对不上原始记录。
    if category_l1:
        query = query.where(InvoiceRecord.category_l1 == category_l1)
    # 关键词同时匹配商户名与一级分类：「房租」「京东」都能搜到。
    # ⚠️ ILIKE 里 % 和 _ 是通配符：用户搜「%」会被拼成 '%%%' 从而匹配全部记录，
    # 看起来像「搜索没生效」。必须转义成字面量，并显式声明 escape 字符。
    if keyword and keyword.strip():
        raw = keyword.strip()
        escaped = raw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        kw = f"%{escaped}%"
        query = query.where(
            or_(
                InvoiceRecord.merchant_name.ilike(kw, escape="\\"),
                InvoiceRecord.category_l1.ilike(kw, escape="\\"),
            )
        )

    count_result = await db.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = count_result.scalar() or 0

    query = query.order_by(InvoiceRecord.created_at.desc())
    query = query.offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    records = result.scalars().all()

    return {
        "items": [_record_payload(r) for r in records],
        "total": total,
        "page": page,
        "size": size,
    }


@router.post("/records", status_code=status.HTTP_201_CREATED)
async def create_record(
    body: InvoiceRecordCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 校验项目归属，避免把记录写进他人的项目
    project_result = await db.execute(
        select(Project).where(
            Project.id == body.project_id, Project.user_id == current_user.id
        )
    )
    if project_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    record = InvoiceRecord(
        project_id=body.project_id,
        file_id=body.file_id,
        user_id=current_user.id,
        direction=body.direction,
        merchant_name=body.merchant_name,
        tax_no=body.tax_no,
        amount=body.amount,
        tax_amount=body.tax_amount,
        invoice_date=body.invoice_date,
        invoice_code=body.invoice_code,
        invoice_no=body.invoice_no,
        category_code=body.category_code,
        category_l1=body.category_l1,
        category_l2=body.category_l2,
        confidence=body.confidence,
        raw_text=body.raw_text,
        reason=body.reason,
    )
    db.add(record)
    # 先 flush 拿 id：算指纹判重时必须能把自己排除掉，否则新记录会判成自己的重复。
    await db.flush()
    await apply_identity_and_verify(db, record)
    await db.commit()
    await db.refresh(record)
    return {**_record_payload(record), "action": "created"}


@router.get("/records/{record_id}")
async def get_record(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _validate_uuid(record_id, "Record")
    result = await db.execute(
        select(InvoiceRecord).where(InvoiceRecord.id == record_id, InvoiceRecord.user_id == current_user.id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    payload = _record_payload(record)

    # 判重命中时把「原件」的关键信息一并带出：用户看到「与 3 月 12 日某某商户
    # 的 1,060.00 元是同一张票」才有意义，只给一个 UUID 等于没给。
    if record.duplicate_of:
        original_result = await db.execute(
            select(InvoiceRecord).where(
                InvoiceRecord.id == record.duplicate_of,
                InvoiceRecord.user_id == current_user.id,
            )
        )
        original = original_result.scalar_one_or_none()
        if original is not None:
            payload["duplicate_detail"] = {
                "id": str(original.id),
                "project_id": str(original.project_id),
                "merchant_name": original.merchant_name,
                "amount": float(original.amount) if original.amount is not None else None,
                "invoice_date": original.invoice_date,
                "invoice_no": original.invoice_no,
                "created_at": original.created_at.isoformat() if original.created_at else None,
            }

    return payload


@router.post("/records/{record_id}/verify")
async def verify_invoice_record(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """对一条记录重跑票面结构自检。

    返回的 `channel` 恒为 `local`：这是本地结构校验 + 官方查验要素整理，
    **不是**税局真伪查验结果。前端文案必须与之一致。
    """
    _validate_uuid(record_id, "Record")
    result = await db.execute(
        select(InvoiceRecord).where(InvoiceRecord.id == record_id, InvoiceRecord.user_id == current_user.id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    payload = await verify_record(record, db)
    await db.commit()
    return payload


@router.patch("/records/{record_id}")
async def update_record(
    record_id: str,
    body: InvoiceRecordUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _validate_uuid(record_id, "Record")
    result = await db.execute(
        select(InvoiceRecord).where(InvoiceRecord.id == record_id, InvoiceRecord.user_id == current_user.id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(record, field, value)

    if update_data:
        record.is_manual_corrected = True
        # 金额/开票日期/发票号码被改动后，原指纹与自检结论都已失效，必须重算，
        # 否则查重结果会与库中字段脱节（例如改掉号码后仍指向旧的重复记录）。
        await apply_identity_and_verify(db, record)

    await db.commit()
    await db.refresh(record)

    return {**_record_payload(record), "updated_fields": list(update_data.keys())}


@router.delete("/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_record(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _validate_uuid(record_id, "Record")
    result = await db.execute(
        select(InvoiceRecord).where(InvoiceRecord.id == record_id, InvoiceRecord.user_id == current_user.id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    await db.delete(record)
    await db.commit()
