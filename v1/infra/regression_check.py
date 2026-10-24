#!/usr/bin/env python3
"""部署后回归自检：只测能脱离真机验证的部分。

覆盖：后端存活、积分（余额/签到幂等/流水/积分包）、套餐与配额口径、
记录搜索筛选（接口 total 与 SQL 直查对比）、AI 分析错误分支、手机号错误映射。

用法（后端需已在 8000 端口运行）：
    cd v1/services/api && ./venv2/bin/python ../../infra/regression_check.py

退出码：0 = 全部通过；1 = 有失败项。
真机部分（UI 渲染、微信授权面板、支付）见 docs/regression-checklist-*.html。
"""

import asyncio
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asyncpg
import httpx
from jose import jwt

# v1/services/api/.env 与 v1/infra/ 的相对位置
V1_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = V1_ROOT / "services" / "api" / ".env"
BASE = "http://127.0.0.1:8000"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  — {detail}" if detail else ""))


def load_env() -> dict:
    if not ENV_FILE.exists():
        print(f"找不到 {ENV_FILE}")
        sys.exit(2)
    env = {}
    for line in ENV_FILE.read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            env[m.group(1)] = m.group(2)
    return env


async def main() -> int:
    env = load_env()
    # 允许用环境变量覆盖库地址：deploy.sh 校验 compose 栈时会指向容器内的 Postgres，
    # 而不是 services/api/.env 里那套（本地开发/生产）地址。
    dsn = os.environ.get("REGRESSION_DATABASE_URL") or env["DATABASE_URL"]
    dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(dsn)

    row = await conn.fetchrow(
        """SELECT p.user_id uid, p.id pid FROM projects p
           JOIN invoice_records r ON r.project_id = p.id
           GROUP BY p.user_id, p.id ORDER BY count(r.id) DESC LIMIT 1"""
    )
    if row is None:
        # 退出码 3 = 没有可测数据（如刚初始化的空库），调用方应视为跳过而非失败
        print("库里没有「带记录的项目」，无法测筛选")
        await conn.close()
        return 3
    uid, pid = row["uid"], str(row["pid"])
    token = jwt.encode(
        {"sub": str(uid), "exp": datetime.now(timezone.utc) + timedelta(minutes=20)},
        env["JWT_SECRET"],
        algorithm=env.get("JWT_ALGORITHM", "HS256"),
    )
    H = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=25.0, trust_env=False) as cl:
        r = await cl.get(f"{BASE}/health")
        check("后端存活 /health", r.status_code == 200, r.text[:60])

        # ---------- 积分 ----------
        r = await cl.get(f"{BASE}/api/points", headers=H)
        d = r.json() if r.status_code == 200 else {}
        check(
            "积分接口返回余额与单价",
            r.status_code == 200 and {"balance", "costs", "checked_in_today"} <= set(d),
            f"balance={d.get('balance')} costs={d.get('costs')}",
        )
        r1 = await cl.post(f"{BASE}/api/points/checkin", headers=H)
        r2 = await cl.post(f"{BASE}/api/points/checkin", headers=H)
        check(
            "签到幂等：同一天第二次被拦截",
            r1.status_code in (200, 400) and r2.status_code == 400 and "签过" in r2.text,
            f"第一次 {r1.status_code}，第二次 {r2.status_code}",
        )
        r = await cl.get(f"{BASE}/api/points/logs", headers=H)
        check("积分流水可读", r.status_code == 200 and isinstance(r.json().get("items"), list))
        r = await cl.get(f"{BASE}/api/points/packages")
        pk = r.json().get("items", []) if r.status_code == 200 else []
        check(
            "积分包列表（单价高于套餐 0.097 元/分）",
            len(pk) == 3 and all(p["unit_price_yuan"] > 0.097 for p in pk),
            ", ".join(f"{p['label']}¥{p['unit_price_yuan']}" for p in pk),
        )

        # ---------- 口径 ----------
        r = await cl.get(f"{BASE}/api/plans")
        items = r.json().get("items", []) if r.status_code == 200 else []
        check(
            "套餐接口为积分口径（无 quota，含 3 个周期）",
            len(items) == 3 and all("quota" not in it and len(it["periods"]) == 3 for it in items),
            f"{[it['code'] for it in items]}",
        )
        r = await cl.get(f"{BASE}/api/me/quota", headers=H)
        d = r.json() if r.status_code == 200 else {}
        check(
            "配额接口已改 points_* 且旧字段移除",
            r.status_code == 200 and "points_balance" in d and "quota_total" not in d,
            f"balance={d.get('points_balance')} used={d.get('points_used_this_month')}",
        )

        # ---------- 搜索筛选 ----------
        async def api_total(params: dict) -> int:
            rr = await cl.get(
                f"{BASE}/api/projects/{pid}/records", params={**params, "size": 5}, headers=H
            )
            return rr.json()["total"] if rr.status_code == 200 else -1

        db_total = await conn.fetchval(
            "SELECT count(*) FROM invoice_records WHERE project_id=$1", pid
        )
        check("筛选：无条件 = 全量", await api_total({}) == db_total, f"{db_total} 条")

        kw = "餐饮"
        db_kw = await conn.fetchval(
            "SELECT count(*) FROM invoice_records WHERE project_id=$1 "
            "AND (merchant_name ILIKE $2 OR category_l1 ILIKE $2)",
            pid,
            f"%{kw}%",
        )
        check(f"筛选：关键词「{kw}」下推 SQL", await api_total({"keyword": kw}) == db_kw, f"{db_kw} 条")

        db_dir = await conn.fetchval(
            "SELECT count(*) FROM invoice_records WHERE project_id=$1 AND direction='out'", pid
        )
        check("筛选：方向=支出", await api_total({"direction": "out"}) == db_dir, f"{db_dir} 条")

        cat = await conn.fetchval(
            "SELECT category_l1 FROM invoice_records "
            "WHERE project_id=$1 AND category_l1 IS NOT NULL LIMIT 1",
            pid,
        )
        if cat:
            db_cat = await conn.fetchval(
                "SELECT count(*) FROM invoice_records WHERE project_id=$1 AND category_l1=$2",
                pid,
                cat,
            )
            check(f"筛选：分类={cat}", await api_total({"category_l1": cat}) == db_cat, f"{db_cat} 条")

        # ---------- AI 分析 ----------
        r = await cl.post(
            f"{BASE}/api/projects/00000000-0000-0000-0000-000000000000/analysis", headers=H
        )
        check("AI 分析：不存在的项目 404", r.status_code == 404, f"HTTP {r.status_code}")

        poor = await conn.fetchval(
            """SELECT u.id FROM users u LEFT JOIN quota_logs q ON q.user_id=u.id
               GROUP BY u.id HAVING COALESCE(SUM(q.delta),0) < 10 LIMIT 1"""
        )
        if poor:
            pt = jwt.encode(
                {"sub": str(poor), "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
                env["JWT_SECRET"],
                algorithm=env.get("JWT_ALGORITHM", "HS256"),
            )
            # 必须选「有记录」的项目：无记录时接口会在扣分前返回 400（这是对的，没数据不该收费）
            ppid = await conn.fetchval(
                """SELECT p.id FROM projects p JOIN invoice_records r ON r.project_id=p.id
                   WHERE p.user_id=$1 LIMIT 1""",
                poor,
            )
            if ppid:
                r = await cl.post(
                    f"{BASE}/api/projects/{ppid}/analysis",
                    headers={"Authorization": f"Bearer {pt}"},
                )
                check("AI 分析：积分不足 402", r.status_code == 402, r.text[:70])
            else:
                check("AI 分析：积分不足 402", True, "低积分用户没有带记录的项目，跳过")
        else:
            check("AI 分析：积分不足 402", True, "暂无低积分用户，跳过")

        # ---------- 手机号 ----------
        r = await cl.post(
            f"{BASE}/api/auth/wechat/bind-phone",
            json={"phone_code": "regression_probe"},
            headers=H,
        )
        check("手机号绑定：无效 code 中文提示", r.status_code == 400 and "授权码" in r.text, r.text[:60])
        r = await cl.post(
            f"{BASE}/api/auth/wechat/phone-login", json={"phone_code": "regression_probe"}
        )
        check("手机号登录：无效 code 中文提示", r.status_code == 400 and "授权码" in r.text, r.text[:60])

    await conn.close()
    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n合计 {passed}/{total} 通过" + ("" if passed == total else "  ← 有失败项"))
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
