"""make user phone unique

Revision ID: 650a058d7b32
Revises: d5e8a1c3f7b2
Create Date: 2026-10-19 15:36:55.525381

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '650a058d7b32'
down_revision: Union[str, None] = 'd5e8a1c3f7b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 手机号要作为账号身份（一键登录 / 换微信找回），必须唯一。
    # 改之前已核对：库里 63 个用户、0 个填了手机号、0 组重复，可直接建唯一索引。
    # 注意 phone 可为 NULL：Postgres 的唯一索引把 NULL 视为互不相同，
    # 所以未绑定手机号的用户不会互相冲突。
    op.drop_index("ix_users_phone", table_name="users")
    op.create_index("ix_users_phone", "users", ["phone"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_phone", table_name="users")
    op.create_index("ix_users_phone", "users", ["phone"], unique=False)
