"""边界条件体检：把各功能的临界输入都打一遍。

用法（后端需已在 8000 端口运行）：
    cd v1/services/api && ./venv2/bin/python ../../infra/edge_cases.py

覆盖：积分扣减临界值、并发双花、签到跨日界、搜索通配符/超长/分页越界、
AI 分析无数据/越权/非法 id、套餐周期非法值、免费套餐下单、鉴权。

会自动创建一个临时用户做并发与临界测试，结束后删除（级联清理流水）。
"""

import asyncio
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import os
import sys

import asyncpg
import httpx
from jose import jwt

V1_ROOT = Path(__file__).resolve().parents[1]
API_DIR = V1_ROOT / "services" / "api"
sys.path.insert(0, str(API_DIR))
# settings 的 .env 是**相对当前工作目录**加载的：不切到 services/api 就会读不到，
# DATABASE_URL 回落成 sqlite，然后在导入 app 时报缺少 aiosqlite。
os.chdir(API_DIR)

BASE = "http://127.0.0.1:8000"
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  — {detail}" if detail else ""))


env = {}
for line in (V1_ROOT / "services" / "api" / ".env").read_text().splitlines():
    m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
    if m:
        env[m.group(1)] = m.group(2)
# 允许覆盖库地址（deploy.sh 校验 compose 栈时指向容器内 Postgres）
DSN = (os.environ.get("REGRESSION_DATABASE_URL") or env["DATABASE_URL"]).replace(
    "postgresql+asyncpg://", "postgresql://"
)
JWT_ALG = env.get("JWT_ALGORITHM", "HS256")


def tok(uid: str, minutes: int = 20) -> str:
    return jwt.encode(
        {"sub": str(uid), "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes)},
        env["JWT_SECRET"],
        algorithm=JWT_ALG,
    )


async def main():
    conn = await asyncpg.connect(DSN)

    # 准备：一个有记录的项目 + 一个临时用户（用于并发/临界测试）
    row = await conn.fetchrow(
        """SELECT p.user_id uid, p.id pid FROM projects p
           JOIN invoice_records r ON r.project_id=p.id
           GROUP BY p.user_id, p.id ORDER BY count(r.id) DESC LIMIT 1"""
    )
    if row is None:
        # 退出码 3 = 没有可测数据（如刚初始化的空库），调用方应视为跳过而非失败
        print("库里没有「带记录的项目」，跳过边界体检")
        await conn.close()
        return 3

    uid, pid = str(row["uid"]), str(row["pid"])

    tmp_openid = f"edge_test_{uuid.uuid4().hex[:10]}"
    tmp_uid = await conn.fetchval(
        "INSERT INTO users (id, openid, plan_code, quota_total, quota_used) "
        "VALUES (gen_random_uuid(), $1, 'free', 0, 0) RETURNING id",
        tmp_openid,
    )

    async with httpx.AsyncClient(timeout=25.0, trust_env=False) as cl:
        print("\n--- 1. 鉴权边界 ---")
        r = await cl.get(f"{BASE}/api/points")
        check("无 token 访问积分 → 401", r.status_code == 401, f"HTTP {r.status_code}")
        fake = jwt.encode({"sub": str(uuid.uuid4()), "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, "wrong-secret", algorithm=JWT_ALG)
        r = await cl.get(f"{BASE}/api/points", headers={"Authorization": f"Bearer {fake}"})
        check("伪造签名 token → 401", r.status_code == 401, f"HTTP {r.status_code}")
        expired = jwt.encode({"sub": uid, "exp": datetime.now(timezone.utc) - timedelta(minutes=1)}, env["JWT_SECRET"], algorithm=JWT_ALG)
        r = await cl.get(f"{BASE}/api/points", headers={"Authorization": f"Bearer {expired}"})
        check("过期 token → 401", r.status_code == 401, f"HTTP {r.status_code}")

        print("\n--- 2. 搜索 / 筛选边界 ---")
        H = {"Authorization": f"Bearer {tok(uid)}"}
        full = (await cl.get(f"{BASE}/api/projects/{pid}/records", params={"size": 1}, headers=H)).json()["total"]
        r = (await cl.get(f"{BASE}/api/projects/{pid}/records", params={"keyword": "", "size": 1}, headers=H)).json()
        check("空关键词 = 全量", r["total"] == full, f"{r['total']} vs {full}")
        r = (await cl.get(f"{BASE}/api/projects/{pid}/records", params={"keyword": "   ", "size": 1}, headers=H)).json()
        check("纯空格关键词 = 全量（trim 后为空）", r["total"] == full, f"{r['total']} vs {full}")
        r = (await cl.get(f"{BASE}/api/projects/{pid}/records", params={"keyword": "%", "size": 1}, headers=H)).json()
        check(
            "关键词含 SQL 通配符 % 不应匹配全量",
            r["total"] < full,
            f"输入 % 得到 {r['total']} 条（全量 {full}）",
        )
        r = (await cl.get(f"{BASE}/api/projects/{pid}/records", params={"keyword": "_", "size": 1}, headers=H)).json()
        check("关键词含 _ 不应匹配全量", r["total"] < full, f"得到 {r['total']} 条")
        long_kw = "票" * 500
        r = await cl.get(f"{BASE}/api/projects/{pid}/records", params={"keyword": long_kw, "size": 1}, headers=H)
        check("超长关键词不 500", r.status_code == 200 and r.json()["total"] == 0, f"HTTP {r.status_code} total={r.json().get('total') if r.status_code==200 else '-'}")
        r = await cl.get(f"{BASE}/api/projects/{pid}/records", params={"page": 9999, "size": 20}, headers=H)
        j = r.json() if r.status_code == 200 else {}
        check("页码越界 → 空列表但 total 正确", r.status_code == 200 and j.get("items") == [] and j.get("total") == full, f"items={len(j.get('items', []))} total={j.get('total')}")
        r = await cl.get(f"{BASE}/api/projects/{pid}/records", params={"size": 101}, headers=H)
        check("size 超上限 101 → 422/400", r.status_code in (400, 422), f"HTTP {r.status_code}")
        r = await cl.get(f"{BASE}/api/projects/{pid}/records", params={"category_l1": "不存在的分类"}, headers=H)
        check("不存在的分类 → 0 条", r.status_code == 200 and r.json()["total"] == 0, f"total={r.json().get('total')}")
        r = await cl.get(f"{BASE}/api/projects/{pid}/records", params={"direction": "bogus"}, headers=H)
        check("非法 direction → 0 条", r.status_code == 200 and r.json()["total"] == 0, f"total={r.json().get('total')}")

        print("\n--- 3. AI 分析边界 ---")
        Ht = {"Authorization": f"Bearer {tok(tmp_uid)}"}
        # 临时用户无项目
        r = await cl.post(f"{BASE}/api/projects/{uuid.uuid4()}/analysis", headers=Ht)
        check("非法项目 id → 404", r.status_code == 404, f"HTTP {r.status_code}")
        r = await cl.post(f"{BASE}/api/projects/not-a-uuid/analysis", headers=Ht)
        check("非 UUID 项目 id → 404（不是 500）", r.status_code == 404, f"HTTP {r.status_code}")
        # 他人项目（越权）
        r = await cl.post(f"{BASE}/api/projects/{pid}/analysis", headers=Ht)
        check("访问他人项目 → 404（越权不可见）", r.status_code == 404, f"HTTP {r.status_code}")
        # 自己的空项目 → 400
        empty_pid = await conn.fetchval(
            "INSERT INTO projects (id, user_id, name, industry, report_month, status) "
            "VALUES (gen_random_uuid(), $1, '空项目', '其他', '2026-10', 'active') RETURNING id",
            tmp_uid,
        )
        r = await cl.post(f"{BASE}/api/projects/{empty_pid}/analysis", headers=Ht)
        check("项目无记录 → 400「暂无票据记录」", r.status_code == 400 and "暂无票据" in r.text, f"HTTP {r.status_code} {r.text[:60]}")

        print("\n--- 4. 支付/套餐边界 ---")
        for pm, label in ((2, "周期=2"), (0, "周期=0"), (13, "周期=13")):
            r = await cl.post(f"{BASE}/api/payments/wechat/prepay", json={"plan_code": "pro", "period_months": pm}, headers=H)
            check(f"非法{label} → 400", r.status_code == 400, f"HTTP {r.status_code}")
        r = await cl.post(f"{BASE}/api/payments/wechat/prepay", json={"plan_code": "pro", "period_months": "abc"}, headers=H)
        check("周期非数字 → 400", r.status_code == 400, f"HTTP {r.status_code}")
        r = await cl.post(f"{BASE}/api/payments/wechat/prepay", json={"plan_code": "no_such_plan"}, headers=H)
        check("不存在的套餐 → 404", r.status_code == 404, f"HTTP {r.status_code}")
        r = await cl.post(f"{BASE}/api/payments/wechat/prepay", json={"plan_code": "free"}, headers=H)
        check("免费套餐下单 → 应拒绝（400）", r.status_code == 400, f"HTTP {r.status_code} {r.text[:60]}")

    # ---------- 5. 积分临界与并发（服务层直测） ----------
    print("\n--- 5. 积分扣减临界与并发 ---")
    from app.models.database import AsyncSessionLocal
    from app.services import points as pts

    async with AsyncSessionLocal() as s:
        await pts.grant(s, tmp_uid, 10, pts.ACTION_SIGNUP, "边界测试充值")
        bal = await pts.get_balance(s, tmp_uid)
        check("充值后余额 = 10", bal == 10, f"balance={bal}")
        after = await pts.consume(s, tmp_uid, 10, pts.ACTION_CONSUME_AI, "恰好扣完")
        check("余额恰好等于成本 → 允许且归零", after == 0, f"扣后 {after}")
        try:
            await pts.consume(s, tmp_uid, 1, pts.ACTION_CONSUME_AI, "差一分")
            check("余额为 0 再扣 → 抛 InsufficientPoints", False, "居然成功了")
        except pts.InsufficientPoints as e:
            check("余额为 0 再扣 → 抛 InsufficientPoints", True, f"required={e.required} balance={e.balance}")
        try:
            await pts.consume(s, tmp_uid, 0, pts.ACTION_CONSUME_AI, "零扣减")
            check("扣减 0 → 抛 ValueError", False, "居然成功了")
        except ValueError:
            check("扣减 0 → 抛 ValueError", True)
        try:
            await pts.grant(s, tmp_uid, -5, pts.ACTION_SIGNUP, "负数发放")
            check("发放负数 → 抛 ValueError", False, "居然成功了")
        except ValueError:
            check("发放负数 → 抛 ValueError", True)

    # 并发双花：余额只够一次，两个并发扣减必须只有一个成功
    async with AsyncSessionLocal() as s:
        await pts.grant(s, tmp_uid, 10, pts.ACTION_SIGNUP, "并发测试充值")

    async def race():
        async with AsyncSessionLocal() as s2:
            try:
                await pts.consume(s2, tmp_uid, 10, pts.ACTION_CONSUME_AI, "并发扣减")
                return True
            except pts.InsufficientPoints:
                return False
            except Exception:
                return False

    outcomes = await asyncio.gather(race(), race())
    async with AsyncSessionLocal() as s3:
        final = await pts.get_balance(s3, tmp_uid)
    check(
        "并发双花：只允许一次成功且余额不为负",
        sum(outcomes) == 1 and final == 0,
        f"成功 {sum(outcomes)}/2，最终余额 {final}",
    )

    # ---------- 6. 签到跨日界 ----------
    print("\n--- 6. 签到边界 ---")
    async with AsyncSessionLocal() as s:
        from app.models.plan import QuotaLog
        # 伪造「昨天（北京时间）」的一次签到，今天应仍可签
        yesterday_cn = (datetime.now(timezone.utc).astimezone(pts.CN_TZ) - timedelta(days=1)).replace(hour=12)
        s.add(QuotaLog(user_id=tmp_uid, action=pts.ACTION_CHECKIN, delta=2, reason="昨天签到"))
        await s.commit()
        await s.execute(
            QuotaLog.__table__.update()
            .where(QuotaLog.user_id == tmp_uid, QuotaLog.reason == "昨天签到")
            .values(created_at=yesterday_cn.astimezone(timezone.utc))
        )
        await s.commit()
        checked = await pts.checked_in_today(s, tmp_uid)
        check("昨天签过 → 今天仍可签（跨日界正确）", checked is False, f"checked_in_today={checked}")

    # 清理临时数据
    await conn.execute("DELETE FROM users WHERE id=$1", tmp_uid)
    await conn.close()

    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n合计 {passed}/{total} 通过" + ("" if passed == total else "  ← 有失败项"))
    return 0 if passed == total else 1


raise SystemExit(asyncio.run(main()))
