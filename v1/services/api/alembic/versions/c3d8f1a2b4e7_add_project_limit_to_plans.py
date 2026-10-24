"""add project_limit to plans

Revision ID: c3d8f1a2b4e7
Revises: a0b6c5c15a1b
Create Date: 2026-09-25 10:00:00.000000

统一套餐定义：plans 表新增 project_limit 列，与 H5 端 plan-config.ts 对齐。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d8f1a2b4e7'
down_revision: Union[str, None] = 'a0b6c5c15a1b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'plans',
        sa.Column('project_limit', sa.BigInteger(), nullable=False, server_default='1'),
    )


def downgrade() -> None:
    op.drop_column('plans', 'project_limit')
