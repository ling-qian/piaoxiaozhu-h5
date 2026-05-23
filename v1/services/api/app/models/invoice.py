import uuid
from typing import Optional

from sqlalchemy import String, Numeric, Boolean, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.database import Base


class InvoiceFile(Base):
    __tablename__ = "invoice_files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    file_url: Mapped[str] = mapped_column(String(512), nullable=False)
    file_key: Mapped[str] = mapped_column(String(512), nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="upload", nullable=False)
    ocr_status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    parse_status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class InvoiceRecord(Base):
    __tablename__ = "invoice_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("invoice_files.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    merchant_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    tax_no: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    tax_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    invoice_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    category_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    category_l1: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    category_l2: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Numeric(5, 4), nullable=True)
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_manual_corrected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
