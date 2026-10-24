import uuid
from typing import Optional

from sqlalchemy import String, BigInteger, DateTime, func
from app.models.types import GUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(GUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    openid: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    unionid: Mapped[Optional[str]] = mapped_column(String(128), unique=True, index=True, nullable=True)
    # 手机号是账号的第二身份：用于一键登录与换微信后的账号找回，因此必须唯一。
    # 可为 NULL（未绑定）；Postgres 唯一索引把 NULL 视为互不相同，不会互相冲突。
    phone: Mapped[Optional[str]] = mapped_column(String(32), unique=True, index=True, nullable=True)
    nickname: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    plan_code: Mapped[str] = mapped_column(String(32), default="free", nullable=False)
    # 付费套餐到期时间（UTC）。NULL 表示无订阅周期，见 services/subscription.py。
    # 到期不在这里落库降级，读取时惰性判定，避免依赖定时任务。
    plan_expires_at: Mapped[Optional[object]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 到期提醒的去重状态：本轮订阅周期内已经提醒到哪一档（d7/d3/d1/expired）。
    # plan_remind_expires_at 记录发提醒时看到的到期时间，续费后它与
    # plan_expires_at 不再相等 → 视为新周期，档位自动清零（见 services/subscription_reminder.py）。
    plan_remind_stage: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    plan_remind_expires_at: Mapped[Optional[object]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    plan_remind_sent_at: Mapped[Optional[object]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    quota_total: Mapped[int] = mapped_column(BigInteger, default=10, nullable=False)
    quota_used: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
