"""add invoice identity, dedup and verification fields

Revision ID: b4f7c2e91a30
Revises: e9b3d5a7c1f2
Create Date: 2026-10-17 10:00:00.000000

为「验真 / 查重 / 数电票归档」补齐数据结构：

- invoice_files：file_hash（原始文件 sha256，用于文件级查重）、
  content_kind（image/xml/ofd，数电票要归档原始 XML/OFD）。
- invoice_records：invoice_code / invoice_no（票据身份）、invoice_fingerprint +
  fingerprint_strength（查重指纹，强弱两档）、duplicate_of（命中已有记录时指路）、
  verify_status / verify_detail / verify_checked_at（票面结构自检结果）。

历史记录的这些列全部为 NULL，语义是「尚未做身份抽取与自检」。这不是错误状态：
旧票据没有号码字段，查重会退回到文件哈希，自检则按「信息不足」处理。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'b4f7c2e91a30'
down_revision: Union[str, None] = 'e9b3d5a7c1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('invoice_files', sa.Column('file_hash', sa.String(length=64), nullable=True))
    op.add_column(
        'invoice_files',
        sa.Column('content_kind', sa.String(length=16), nullable=False, server_default='image'),
    )
    op.create_index('ix_invoice_files_file_hash', 'invoice_files', ['file_hash'])

    op.add_column('invoice_records', sa.Column('invoice_code', sa.String(length=32), nullable=True))
    op.add_column('invoice_records', sa.Column('invoice_no', sa.String(length=32), nullable=True))
    op.add_column(
        'invoice_records', sa.Column('invoice_fingerprint', sa.String(length=64), nullable=True)
    )
    op.add_column(
        'invoice_records', sa.Column('fingerprint_strength', sa.String(length=16), nullable=True)
    )
    op.add_column(
        'invoice_records',
        sa.Column('duplicate_of', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column('invoice_records', sa.Column('verify_status', sa.String(length=16), nullable=True))
    op.add_column('invoice_records', sa.Column('verify_detail', sa.Text(), nullable=True))
    op.add_column(
        'invoice_records',
        sa.Column('verify_checked_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index('ix_invoice_records_invoice_no', 'invoice_records', ['invoice_no'])
    op.create_index(
        'ix_invoice_records_invoice_fingerprint', 'invoice_records', ['invoice_fingerprint']
    )
    op.create_foreign_key(
        'fk_invoice_records_duplicate_of',
        'invoice_records',
        'invoice_records',
        ['duplicate_of'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_invoice_records_duplicate_of', 'invoice_records', type_='foreignkey')
    op.drop_index('ix_invoice_records_invoice_fingerprint', table_name='invoice_records')
    op.drop_index('ix_invoice_records_invoice_no', table_name='invoice_records')
    op.drop_column('invoice_records', 'verify_checked_at')
    op.drop_column('invoice_records', 'verify_detail')
    op.drop_column('invoice_records', 'verify_status')
    op.drop_column('invoice_records', 'duplicate_of')
    op.drop_column('invoice_records', 'fingerprint_strength')
    op.drop_column('invoice_records', 'invoice_fingerprint')
    op.drop_column('invoice_records', 'invoice_no')
    op.drop_column('invoice_records', 'invoice_code')

    op.drop_index('ix_invoice_files_file_hash', table_name='invoice_files')
    op.drop_column('invoice_files', 'content_kind')
    op.drop_column('invoice_files', 'file_hash')
