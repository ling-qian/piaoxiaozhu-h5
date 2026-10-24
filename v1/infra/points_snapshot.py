#!/usr/bin/env python3
"""积分快照：一次性打印某用户的余额、今日签到状态、最近流水与订单。

真机回归时用来「操作前 / 操作后」对比，快速判断是前端没刷新还是后端没扣分。

用法：
    cd v1/services/api && ./venv2/bin/python ../../infra/points_snapshot.py
    # 指定用户（uuid 或手机号后四位）
    ... points_snapshot.py --user <uuid>
    ... points_snapshot.py --user 6942
"""

import argparse
import asyncio
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asyncpg

V1_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = V1_ROOT / "services" / "api" / ".env"
CN = timezone(timedelta(hours=8))

ACTION_LABEL = {
    "signup_bonus": "注册赠送",
    "daily_checkin": "每日签到",
    "purchase_grant": "购买/发放",
    "consume_invoice_ocr": "票据识别",
    "consume_ai_analysis": "AI 分析",
    "purchase_legacy": "历史记录(不计分)",
}


def load_dsn() -> str:
    env = {}
    for line in ENV_FILE.read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            env[m.group(1)] = m.group(2)
    return env["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", help="用户 uuid，或手机号后四位")
    args = ap.parse_args()

    conn = await asyncpg.connect(load_dsn())

    if args.user:
        if len(args.user) >= 32:
            user = await conn.fetchrow("SELECT id, nickname, phone, plan_code FROM users WHERE id=$1", args.user)
        else:
            user = await conn.fetchrow(
                "SELECT id, nickname, phone, plan_code FROM users WHERE phone LIKE $1 ORDER BY created_at DESC LIMIT 1",
                f"%{args.user}",
            )
    else:
        # 默认取「最近有积分流水」的用户，通常就是正在测试的那个
        user = await conn.fetchrow(
            """SELECT u.id, u.nickname, u.phone, u.plan_code
               FROM users u JOIN quota_logs q ON q.user_id = u.id
               GROUP BY u.id ORDER BY max(q.created_at) DESC LIMIT 1"""
        )

    if user is None:
        print("没找到用户")
        await conn.close()
        return

    uid = user["id"]
    balance = await conn.fetchval(
        "SELECT COALESCE(SUM(delta),0) FROM quota_logs WHERE user_id=$1", uid
    )

    day_start_cn = (
        datetime.now(timezone.utc).astimezone(CN).replace(hour=0, minute=0, second=0, microsecond=0)
    ).astimezone(timezone.utc)
    checked = await conn.fetchval(
        """SELECT count(*) FROM quota_logs
           WHERE user_id=$1 AND action='daily_checkin' AND created_at >= $2""",
        uid,
        day_start_cn,
    )

    print("=" * 56)
    print(f"用户 {str(uid)[:8]}…  昵称={user['nickname'] or '（无）'}  手机={user['phone'] or '未绑定'}  套餐={user['plan_code']}")
    print(f"积分余额：{balance}")
    print(f"今日签到：{'是' if checked else '否'}（按北京时间日界）")
    print("=" * 56)

    logs = await conn.fetch(
        """SELECT action, delta, coalesce(reason,''), created_at FROM quota_logs
           WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10""",
        uid,
    )
    print("\n最近 10 条积分流水：")
    for r in logs:
        ts = r["created_at"].astimezone(CN).strftime("%m-%d %H:%M:%S")
        label = ACTION_LABEL.get(r["action"], r["action"])
        sign = "+" if r["delta"] > 0 else ""
        print(f"  {ts}  {label:16s} {sign}{r['delta']:>5}  {r[2][:40]}")

    orders = await conn.fetch(
        """SELECT plan_code, amount_cents, period_months, status, created_at
           FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5""",
        uid,
    )
    if orders:
        print("\n最近 5 笔订单：")
        for r in orders:
            ts = r["created_at"].astimezone(CN).strftime("%m-%d %H:%M")
            print(
                f"  {ts}  {r['plan_code']:12s} ¥{r['amount_cents']/100:>7.2f}  {r['period_months']}个月  {r['status']}"
            )

    await conn.close()


asyncio.run(main())
