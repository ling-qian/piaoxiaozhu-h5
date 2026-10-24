"""add subscription reminder tracking

Revision ID: d5e8a1c3f7b2
Revises: b4f7c2e91a30
Create Date: 2026-10-17 10:00:00.000000

到期提醒的去重：同一轮订阅周期内，每个提醒档位（7/3/1 天、已到期）只发一次。

不用单独的提醒记录表，而是把状态挂在 users 上，理由：
- 只需要「本轮已提醒到哪一档」，表结构会带来一次 join 却没有任何额外信息；
- plan_remind_expires_at 记录「发提醒时看到的到期时间」。用户续费后
  plan_expires_at 会前移，与之不再相等，即自动视为新周期、提醒档位清零，
  不需要在支付回调里额外写一段「重置提醒状态」的逻辑。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5e8a1c3f7b2'
down_revision: Union[str, None] = 'b4f7c2e91a30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('plan_remind_stage', sa.String(length=16), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('plan_remind_expires_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('plan_remind_sent_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'plan_remind_sent_at')
    op.drop_column('users', 'plan_remind_expires_at')
    op.drop_column('users', 'plan_remind_stage')
