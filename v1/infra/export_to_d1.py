#!/usr/bin/env python3
"""把 PostgreSQL（Neon / 本地 PG）的数据导出成 D1 可执行的 SQL。

设计取舍：
- **生成 INSERT 而不是走 API**：表结构与类型映射可控，且能一次导完，
  不受接口契约变动影响。
- **按外键依赖排序**：先用户、再客户/项目、最后记录，避免 D1 拒收。
- **类型显式转换**：uuid→TEXT、timestamptz→ISO 8601 UTC、numeric→REAL、bool→0/1。
  这个映射必须与 `apps/api-worker/src/db/schema.sql` 完全一致，
  否则导入后日期比较、布尔判断都会静默出错。

用法：
    cd v1/services/api && ../../services/api/venv2/bin/python ../../infra/export_to_d1.py
产物：
    v1/infra/d1-import.sql
导入：
    cd v1/apps/api-worker && npx wrangler d1 execute piaoxiaozhu --remote --file=../infra/d1-import.sql
"""

from __future__ import annotations

import asyncio
import re
import sys
import uuid
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import asyncpg

ENV_FILE = Path(__file__).resolve().parent.parent / "services" / "api" / ".env"
OUT_FILE = Path(__file__).resolve().parent / "d1-import.sql"

# 按外键依赖排序：被引用的表必须在前
TABLES: list[tuple[str, list[str]]] = [
    ("users", ["id", "openid", "unionid", "phone", "nickname", "avatar_url", "plan_code",
               "quota_total", "quota_used", "created_at", "plan_expires_at",
               "plan_remind_stage", "plan_remind_expires_at", "plan_remind_sent_at"]),
    ("customers", ["id", "user_id", "name", "industry", "contact_name", "contact_phone",
                   "remark", "created_at"]),
    ("projects", ["id", "user_id", "customer_id", "name", "industry", "report_month",
                  "status", "created_at"]),
    ("plans", ["id", "code", "name", "quota", "price_cents", "features", "is_active",
               "created_at", "project_limit"]),
    ("invoice_files", ["id", "project_id", "user_id", "file_url", "file_key", "source",
                       "ocr_status", "parse_status", "created_at", "file_hash", "content_kind"]),
    ("invoice_records", ["id", "project_id", "file_id", "user_id", "direction", "merchant_name",
                         "tax_no", "amount", "tax_amount", "invoice_date", "category_code",
                         "category_l1", "category_l2", "confidence", "raw_text", "reason",
                         "is_manual_corrected", "created_at", "updated_at", "invoice_code",
                         "invoice_no", "invoice_fingerprint", "fingerprint_strength",
                         "duplicate_of", "verify_status", "verify_detail", "verify_checked_at"]),
    ("orders", ["id", "user_id", "plan_code", "amount_cents", "transaction_id", "status",
                "paid_at", "created_at", "period_months"]),
    ("quota_logs", ["id", "user_id", "action", "delta", "reason", "created_at"]),
    ("report_snapshots", ["id", "project_id", "user_id", "version", "summary", "detail_json",
                          "share_token", "status", "created_at"]),
]


def load_env() -> dict:
    env = {}
    for line in ENV_FILE.read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            env[m.group(1)] = m.group(2)
    return env


def sql_literal(v) -> str:
    """把一个 Python 值转成 SQLite 字面量。

    字符串统一转义单引号（SQLite 标准做法，不用反斜杠），
    这样带换行、引号的 OCR 原文也能安全入库。
    """
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int,)):
        return str(v)
    if isinstance(v, Decimal):
        # 金额：保留两位小数，避免 float 二进制误差写进库里
        return f"{float(v):.2f}"
    if isinstance(v, float):
        return repr(v)
    if isinstance(v, datetime):
        # timestamptz → ISO 8601 UTC（定长，字典序即时间序）
        dt = v.astimezone(tz=None) if v.tzinfo else v
        return "'" + dt.astimezone(__import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z") + "'"
    if isinstance(v, date):
        return "'" + v.isoformat() + "'"
    if isinstance(v, uuid.UUID):
        return "'" + str(v) + "'"
    if isinstance(v, (dict, list)):
        import json

        return "'" + str(json.dumps(v, ensure_ascii=False)).replace("'", "''") + "'"
    return "'" + str(v).replace("'", "''") + "'"


async def main() -> int:
    env = load_env()
    dsn = env["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    host = dsn.split("@")[-1].split("/")[0].split(":")[0]
    remote = host not in ("localhost", "127.0.0.1", "::1")

    conn = await asyncpg.connect(dsn, ssl="require" if remote else None, statement_cache_size=0)

    lines: list[str] = [
        "-- 由 infra/export_to_d1.py 自动生成，请勿手改",
        "-- 导入：cd v1/apps/api-worker && npx wrangler d1 execute piaoxiaozhu --remote --file=../infra/d1-import.sql",
        "PRAGMA foreign_keys = OFF;",
        "",
    ]
    counts: dict[str, int] = {}

    try:
        for table, cols in TABLES:
            try:
                rows = await conn.fetch(f"SELECT {', '.join(cols)} FROM {table}")
            except Exception as e:
                print(f"  ⚠️ {table} 读取失败，跳过: {type(e).__name__}")
                counts[table] = 0
                continue

            counts[table] = len(rows)
            lines.append(f"-- {table}: {len(rows)} 行")
            if rows:
                col_list = ", ".join(cols)
                # 分批 INSERT，单条语句别太长（D1 对 SQL 长度有限制）
                batch_size = 200
                for i in range(0, len(rows), batch_size):
                    chunk = rows[i : i + batch_size]
                    values = []
                    for r in chunk:
                        values.append("(" + ", ".join(sql_literal(r[c]) for c in cols) + ")")
                    lines.append(f"INSERT INTO {table} ({col_list}) VALUES\n  " + ",\n  ".join(values) + ";")
            lines.append("")
    finally:
        await conn.close()

    lines.append("PRAGMA foreign_keys = ON;")
    OUT_FILE.write_text("\n".join(lines) + "\n")

    total = sum(counts.values())
    print("=== 导出行数（应与源库一致）===")
    for t, n in counts.items():
        print(f"  {t:<20} {n:>6}")
    print(f"  {'合计':<20} {total:>6}")
    print(f"\n  产物: {OUT_FILE}  ({OUT_FILE.stat().st_size / 1024:.1f} KB)")
    return 0 if total > 0 else 3


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
