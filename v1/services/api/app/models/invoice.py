import uuid
from typing import Optional

from sqlalchemy import String, Numeric, Boolean, Text, DateTime, ForeignKey, func
from app.models.types import GUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.database import Base


class InvoiceFile(Base):
    __tablename__ = "invoice_files"

    id: Mapped[uuid.UUID] = mapped_column(GUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(GUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    file_url: Mapped[str] = mapped_column(String(512), nullable=False)
    file_key: Mapped[str] = mapped_column(String(512), nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="upload", nullable=False)
    # 原始文件内容的 sha256。用于「同一张图片被重复上传」的文件级查重，
    # 与发票号码级的查重互为补充：号码读不出来时，文件哈希仍然有效。
    file_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    # image / xml / ofd。数电票归档需要保留原始 XML/OFD 文件，不只是图片。
    content_kind: Mapped[str] = mapped_column(String(16), default="image", nullable=False)
    ocr_status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    parse_status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class InvoiceRecord(Base):
    __tablename__ = "invoice_records"

    id: Mapped[uuid.UUID] = mapped_column(GUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    file_id: Mapped[Optional[uuid.UUID]] = mapped_column(GUID(as_uuid=True), ForeignKey("invoice_files.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(GUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    merchant_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    tax_no: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    tax_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    invoice_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # 票据身份字段：传统发票与数电票共用的部分。数电票只有 20 位发票号码、没有代码。
    invoice_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    invoice_no: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    # 查重指纹（见 core 的 invoice_identity）。强弱两档，索引用于跨项目查重。
    invoice_fingerprint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    fingerprint_strength: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    # 判重命中时指向「已经存在的那条记录」。只是标记 + 指路，不自动删除：
    # 同一张票确实可能被合法地记两次（比如补录），删不删由用户决定。
    duplicate_of: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(as_uuid=True), ForeignKey("invoice_records.id", ondelete="SET NULL"), nullable=True
    )
    category_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    category_l1: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    category_l2: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Numeric(5, 4), nullable=True)
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # 票面结构自检结果（见 core 的 invoice_check）。**不是**税局真伪查验结果。
    verify_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    verify_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verify_checked_at: Mapped[Optional[object]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_manual_corrected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
