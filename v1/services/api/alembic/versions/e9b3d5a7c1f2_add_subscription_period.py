"""add subscription period fields

Revision ID: e9b3d5a7c1f2
Revises: c3d8f1a2b4e7
Create Date: 2026-10-16 10:00:00.000000

按月续费：users 新增 plan_expires_at（付费套餐到期时间），orders 新增
period_months（本单覆盖的订阅月数）。

历史付费数据（plan_code 为付费但 plan_expires_at 为 NULL）按「无订阅周期」
处理，仍视为有效，避免迁移直接掐掉已付费用户；上线后的每笔支付都会写入
明确的到期时间。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e9b3d5a7c1f2'
down_revision: Union[str, None] = 'c3d8f1a2b4e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('plan_expires_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'orders',
        sa.Column('period_months', sa.BigInteger(), nullable=False, server_default='1'),
    )


def downgrade() -> None:
    op.drop_column('orders', 'period_months')
    op.drop_column('users', 'plan_expires_at')
