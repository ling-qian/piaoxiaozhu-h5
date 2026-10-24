#!/usr/bin/env python3
"""端到端测试：按真实用户的操作顺序把产品走一遍。

与 regression_check / edge_cases 的区别：那两个验证「接口对不对」，
这个验证「用户能不能把事办完」——顺序、状态流转、前一步的产出是否是后一步的输入，
都会在这里暴露。

## 覆盖路径

  打开小程序 → 登录 → 看首页 → 签到 → 建项目 → 录票据 → 列表/筛选
  → 报表 → AI 分析 → 问账 → 审单 → 简报 → 体检 → 积分流水 → 清理

## 数据隔离

所有写操作都落在专门的测试用户 `e2e-bot` 上，跑完自动清理，
不会污染真实用户的账目。

## 用法

  python infra/e2e_journey.py              # 本地后端全流程
  python infra/e2e_journey.py --prod       # 追加线上只读抽查
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asyncpg
import httpx
from jose import jwt


def connect(dsn: str) -> "asyncpg.Connection":
    """按目标主机决定是否启用 SSL。

    本地 PostgreSQL 不监听 SSL，强制 require 会直接报
    "rejected SSL upgrade"；Neon 等云库则必须 SSL。
    这里不猜：非 localhost 一律启用，避免把明文连接打到公网库上。
    """
    host = dsn.split("@")[-1].split("/")[0].split(":")[0]
    remote = host not in ("localhost", "127.0.0.1", "::1")
    return asyncpg.connect(
        dsn,
        ssl="require" if remote else None,
        statement_cache_size=0,
    )

ENV_FILE = Path(__file__).resolve().parent.parent / "services" / "api" / ".env"
LOCAL_BASE = "http://127.0.0.1:8000"
PROD_BASE = "https://api-332114-12-1510254099.sh.run.tcloudbase.com"

BOT_OPENID = "e2e-bot-openid"
STEP_NAMES = []


def load_env() -> dict:
    env = {}
    for line in ENV_FILE.read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m:
            env[m.group(1)] = m.group(2)
    return env


def neon_dsn(env: dict) -> str | None:
    """线上库（Neon）连接串。

    它不在 .env 的键值里，而是以 `# NEON_DATABASE_URL=...` 注释形式保存
    （本地开发默认指向本机 PG，两者已不是同一个库）。
    线上抽查必须用线上库里的用户，否则会得到 401 User not found。
    """
    for line in ENV_FILE.read_text().splitlines():
        m = re.match(r"^#\s*NEON_DATABASE_URL=(\S+)", line.strip())
        if m:
            return m.group(1).replace("postgresql+asyncpg://", "postgresql://")
    return None


# --------------------------------------------------------------------------- 结果记录

class Report:
    def __init__(self) -> None:
        self.steps: list[tuple[str, str, str]] = []   # (阶段, 状态, 说明)

    def add(self, stage: str, ok: bool, note: str = "") -> None:
        self.steps.append((stage, "PASS" if ok else "FAIL", note))
        mark = "✅" if ok else "❌"
        print(f"  {mark} [{stage}] {note}" if note else f"  {mark} [{stage}]")

    def section(self, title: str) -> None:
        print(f"\n{'─' * 68}\n  {title}\n{'─' * 68}")

    def summary(self) -> int:
        total = len(self.steps)
        failed = [s for s in self.steps if s[1] == "FAIL"]
        print(f"\n{'═' * 68}")
        print(f"  端到端结果：{total - len(failed)}/{total} 通过")
        if failed:
            print("\n  失败步骤：")
            for stage, _, note in failed:
                print(f"    · {stage}：{note}")
        print(f"{'═' * 68}")
        return 1 if failed else 0


R = Report()


def safe_json(resp) -> dict:
    """容错取 JSON：HTML 错误页（504/502）直接返回带原文的字典，不让测试崩在半路。"""
    try:
        return resp.json()
    except Exception:
        return {"__raw__": resp.text[:200], "__status__": resp.status_code}


def money(v) -> str:
    try:
        return f"¥{float(v):,.2f}"
    except (TypeError, ValueError):
        return "¥0.00"


# --------------------------------------------------------------------------- 主流程


async def run_journey(base: str, env: dict, dsn: str) -> None:
    conn = await connect(dsn)

    # ---------- 准备：专用测试用户 ----------
    R.section("0. 准备：创建专用测试用户（隔离数据，不污染真实账目）")
    uid = uuid.uuid4()
    # users 表没有 updated_at 列（id/openid/phone/plan_code/quota_*/created_at/plan_*），
    # 曾误写 updated_at 导致 UndefinedColumnError——按 information_schema 的实际字段写。
    await conn.execute(
        """INSERT INTO users (id, openid, plan_code, quota_total, quota_used, created_at)
           VALUES ($1, $2, 'free', 10, 0, NOW())
           ON CONFLICT (openid) DO NOTHING""",
        uid, BOT_OPENID,
    )
    row = await conn.fetchrow("SELECT id FROM users WHERE openid = $1", BOT_OPENID)
    uid = row["id"]
    # 清掉上次残留，保证每次从干净状态开始
    await conn.execute("DELETE FROM invoice_records WHERE user_id = $1", uid)
    await conn.execute("DELETE FROM projects WHERE user_id = $1", uid)
    await conn.execute("DELETE FROM quota_logs WHERE user_id = $1", uid)
    # 充 20 积分：AI 分析要 10 分，不充的话会撞 402，测不到真实链路
    # quota_logs.id 没有数据库默认值（由 Python 侧生成），裸插必须显式给
    await conn.execute(
        "INSERT INTO quota_logs (id, user_id, action, delta, reason) "
        "VALUES (gen_random_uuid(), $1, 'purchase_grant', 20, 'E2E 充值')",
        uid,
    )
    print(f"  测试用户 {str(uid)[:8]}… 已就绪（充值 20 积分）")

    token = jwt.encode(
        {"sub": str(uid), "exp": datetime.now(timezone.utc) + timedelta(hours=2)},
        env["JWT_SECRET"], algorithm="HS256",
    )
    H = {"Authorization": f"Bearer {token}"}

    created: dict = {"records": [], "projects": []}

    async with httpx.AsyncClient(timeout=180, trust_env=False) as cl:
        # ---------- 1. 打开小程序：登录 + 首页 ----------
        R.section("1. 打开小程序（静默登录 → 首页数据）")
        r = await cl.get(f"{base}/api/me", headers=H)
        me = r.json() if r.status_code == 200 else {}
        R.add("登录/身份", r.status_code == 200 and me.get("id") == str(uid),
              f"HTTP {r.status_code}，openid={me.get('openid')}")
        R.add("登录后有 token 权限", r.status_code == 200,
              "401 会说明鉴权链路断了")

        r = await cl.get(f"{base}/api/me/quota", headers=H)
        q = r.json() if r.status_code == 200 else {}
        R.add("首页配额", r.status_code == 200,
              f"套餐={q.get('plan_code')} 积分={q.get('points_balance')}")

        r = await cl.get(f"{base}/api/projects", headers=H)
        R.add("首页项目列表", r.status_code == 200, f"共 {len(r.json() or [])} 个项目")

        # ---------- 2. 签到 ----------
        R.section("2. 点击「签到 +2」")
        r = await cl.post(f"{base}/api/points/checkin", headers=H)
        first = r.status_code == 200
        R.add("首次签到", first, f"HTTP {r.status_code} {r.json().get('message', '')}")
        r2 = await cl.post(f"{base}/api/points/checkin", headers=H)
        R.add("重复签到被拒", r2.status_code == 400,
              f"HTTP {r2.status_code}（应 400：一天只能签到一次）")

        # ---------- 3. 建项目 ----------
        R.section("3. 创建项目")
        r = await cl.post(f"{base}/api/projects", headers=H,
                          json={"name": "E2E测试门店", "description": "端到端测试用"})
        proj = r.json() if r.status_code in (200, 201) else {}
        pid = proj.get("id") or ""
        if pid:
            created["projects"].append(pid)
        R.add("创建项目", bool(pid), f"id={pid[:8] if pid else '空'}")

        # ---------- 4. 录入票据（对话式记账 + 手工录入） ----------
        R.section("4. 录入票据（模拟用户填表保存）")
        if pid:
            r = await cl.post(f"{base}/api/records", headers=H, json={
                "project_id": pid, "direction": "out", "amount": 128.50,
                "merchant_name": "盒马鲜生", "invoice_date": "2026-10-20",
                "category_l1": "食材", "raw_text": "E2E 录入：盒马买菜",
            })
            rec = r.json() if r.status_code in (200, 201) else {}
            if rec.get("id"):
                created["records"].append(rec["id"])
            R.add("保存一笔支出", bool(rec.get("id")),
                  f"金额 {money(rec.get('amount'))} 分类={rec.get('category_l1')}")

            # 票面自检是否自动跑
            R.add("票面自检自动执行", rec.get("verify_status") in ("pass", "attention", "insufficient"),
                  f"verify_status={rec.get('verify_status')}")

            r = await cl.post(f"{base}/api/records", headers=H, json={
                "project_id": pid, "direction": "out", "amount": 3800.00,
                "merchant_name": "老王烧烤店", "invoice_date": "2026-10-21",
                "category_l1": "食材", "raw_text": "E2E 录入：老王烧烤",
            })
            rec2 = r.json() if r.status_code in (200, 201) else {}
            if rec2.get("id"):
                created["records"].append(rec2["id"])
            R.add("再保存一笔（供统计）", bool(rec2.get("id")),
                  f"金额 {money(rec2.get('amount'))}")

        # ---------- 5. 票据列表 + 筛选 ----------
        R.section("5. 票据列表与筛选（验证 GET 参数真的生效）")
        if pid:
            r = await cl.get(f"{base}/api/projects/{pid}/records",
                             params={"direction": "out"}, headers=H)
            all_out = r.json() or {}
            n_all = all_out.get("total", len(all_out.get("items", [])))
            R.add("按方向筛选", r.status_code == 200, f"支出共 {n_all} 条")

            r = await cl.get(f"{base}/api/projects/{pid}/records",
                             params={"keyword": "盒马"}, headers=H)
            hit = r.json() or {}
            items = hit.get("items", [])
            ok = r.status_code == 200 and all("盒马" in (i.get("merchant_name") or "") for i in items)
            R.add("关键词筛选", ok and len(items) >= 1,
                  f"命中 {len(items)} 条（筛「盒马」只应出盒马）")

            r = await cl.get(f"{base}/api/projects/{pid}/records",
                             params={"category_l1": "食材"}, headers=H)
            R.add("按分类筛选", r.status_code == 200, "HTTP " + str(r.status_code))

        # ---------- 6. 报表 ----------
        R.section("6. 生成报表")
        if pid:
            r = await cl.get(f"{base}/api/projects/{pid}/report", headers=H)
            rep = r.json() if r.status_code == 200 else {}
            detail = rep.get("detail_json")
            if isinstance(detail, str):
                detail = json.loads(detail)
            R.add("项目报表", r.status_code == 200,
                  f"记录 {detail.get('total_records')} 条 / 支出 {money(detail.get('total_cost'))}")

            # free 套餐的 can_export 为 False，应当被 403 挡住。
            # 之前这里断言 200，把「正确的权限拦截」误判成失败。
            r = await cl.get(f"{base}/api/projects/{pid}/report/export",
                             params={"fmt": "csv"}, headers=H)
            body = r.json() if r.status_code != 200 else {}
            R.add("导出 CSV（免费套餐被拦截）",
                  r.status_code == 403 and "套餐" in str(body.get("detail", "")),
                  f"HTTP {r.status_code} {body.get('detail', '')[:30]}")

        # ---------- 7. AI 能力 ----------
        R.section("7. AI 能力（分析 / 问账 / 审单 / 简报 / 体检）")
        if pid:
            t0 = datetime.now()
            r = await cl.post(f"{base}/api/projects/{pid}/analysis", headers=H)
            dt = (datetime.now() - t0).total_seconds()
            if r.status_code == 200:
                body = r.json()
                text = body.get("analysis") or body.get("content") or str(body)
                R.add("AI 经营分析", len(text) > 80,
                      f"耗时 {dt:.1f}s，产出 {len(text)} 字"
                      f"（>15s 则在 callContainer 下会超时）")
            else:
                R.add("AI 经营分析", False, f"HTTP {r.status_code} {str(r.json())[:80]}")

        r = await cl.post(f"{base}/api/insights/ask", headers=H,
                          json={"question": "这个月食材花了多少钱"})
        ans = r.json() if r.status_code == 200 else {}
        R.add("问账", r.status_code == 200 and bool(ans.get("answer")),
              f"免费剩余={ans.get('free_remaining')} | {str(ans.get('answer'))[:40]}")

        r = await cl.post(f"{base}/api/insights/ask", headers=H,
                          json={"question": "帮我删掉所有数据"})
        # 关键断言是「没有返回 200」：400 = 正确识别为越界并拒绝；
        # 503 = 模型没解析出意图（偶发），同样不会执行查询。
        # 若返回 200，说明越界请求穿透了安全检查，必须失败。
        R.add("越界提问未穿透", r.status_code != 200,
              f"HTTP {r.status_code}"
              + ("（正确拒绝）" if r.status_code == 400 else "（未解析出意图，也未执行）"))

        r = await cl.get(f"{base}/api/insights/audit-report", headers=H)
        ar = r.json() if r.status_code == 200 else {}
        R.add("AI 审单报告", r.status_code == 200 and "summary" in ar,
              f"扫描 {ar.get('summary', {}).get('record_count')} 条，"
              f"发现 {ar.get('summary', {}).get('finding_count')} 项，"
              f"意见 {len(ar.get('advice') or '')} 字")

        r = await cl.get(f"{base}/api/insights/monthly-digest",
                         params={"month": "2026-10"}, headers=H)
        md = r.json() if r.status_code == 200 else {}
        R.add("月度简报", r.status_code == 200 and bool(md.get("text")),
              str(md.get("text"))[:52])

        r = await cl.get(f"{base}/api/insights/anomalies", headers=H)
        an = r.json() if r.status_code == 200 else {}
        R.add("账目体检", r.status_code == 200,
              f"扫描 {an.get('scanned')} 条，发现 {an.get('total')} 项")

        # ---------- 8. 对话式记账 ----------
        R.section("8. 对话式记账（说一句话 → 确认 → 保存）")
        r = await cl.post(f"{base}/api/insights/parse-text", headers=H,
                          json={"text": "昨天盒马买菜 128"})
        pe = r.json() if r.status_code == 200 else {}
        R.add("一句话解析", r.status_code == 200 and pe.get("ok"),
              f"{pe.get('direction')} {money(pe.get('amount'))} "
              f"{pe.get('merchant')} {pe.get('date')} {pe.get('category_l1')}")
        if pid and pe.get("ok") and pe.get("amount"):
            r = await cl.post(f"{base}/api/records", headers=H, json={
                "project_id": pid, "direction": pe["direction"],
                "amount": pe["amount"], "merchant_name": pe["merchant"] or "手工录入",
                "invoice_date": pe["date"], "category_l1": pe["category_l1"],
                "raw_text": pe.get("note"), "reason": "对话式记账",
            })
            rec3 = r.json() if r.status_code in (200, 201) else {}
            if rec3.get("id"):
                created["records"].append(rec3["id"])
            R.add("确认后入库", bool(rec3.get("id")), f"HTTP {r.status_code}")

        # ---------- 9. 积分流水 ----------
        R.section("9. 积分流水（核对扣费是否对得上）")
        r = await cl.get(f"{base}/api/points/logs", headers=H)
        logs = r.json() or {}
        items = logs.get("items", logs) if isinstance(logs, dict) else logs
        actions = [x.get("action") for x in items]
        R.add("流水可查", r.status_code == 200,
              f"共 {len(items)} 条，动作：{', '.join(sorted(set(actions)))}")

        r = await cl.get(f"{base}/api/me/quota", headers=H)
        q2 = r.json() if r.status_code == 200 else {}
        # 不写死公式：流水各条 delta 之和，必须等于余额的净变化。
        # 写死公式会踩坑——问账第 1 次是免费的（delta=0），不是 -1。
        delta_sum = sum(int(x.get("delta") or 0) for x in items)
        net = q2.get("points_balance", 0) - 0      # 用户初始余额为 0
        R.add("余额与流水自洽", delta_sum == net,
              f"流水合计 {delta_sum:+d}，余额 {net:+d}"
              f"（签到+2、分析-10、问账第1次免费+0、充值+20）")

        # 再单独确认关键动作的数值
        by_action: dict[str, int] = {}
        for x in items:
            by_action[x.get("action", "")] = by_action.get(x.get("action", ""), 0) + int(x.get("delta") or 0)
        R.add("签到发放 +2", by_action.get("daily_checkin") == 2,
              f"实际 {by_action.get('daily_checkin'):+d}")
        R.add("AI 分析扣 10 分", by_action.get("consume_ai_analysis") == -10,
              f"实际 {by_action.get('consume_ai_analysis'):+d}")

        # ---------- 清理 ----------
        R.section("10. 清理测试数据")
        for rid in created["records"]:
            await cl.delete(f"{base}/api/records/{rid}", headers=H)
        for pid2 in created["projects"]:
            await cl.delete(f"{base}/api/projects/{pid2}", headers=H)
        left = await conn.fetchval("SELECT count(*) FROM invoice_records WHERE user_id = $1", uid)
        R.add("测试数据已清空", left == 0, f"剩余记录 {left} 条")

    await conn.close()


# --------------------------------------------------------------------------- 线上抽查


async def prod_smoke(base: str, env: dict, dsn: str) -> None:
    """线上只读抽查：不写数据，只验证新代码已生效且关键链路通。"""
    prod_dsn = neon_dsn(env)
    if not prod_dsn:
        print("  没找到 Neon 连接串，跳过线上抽查")
        return
    conn = await asyncpg.connect(prod_dsn, ssl="require", statement_cache_size=0)
    # 用线上库里票据最多的真实用户：只读接口，不写任何数据。
    # 不能用本地库的 e2e-bot——本地 PG 与 Neon 已不是同一个库，
    # 拿本地用户打线上会得到 401 User not found。
    row = await conn.fetchrow(
        """SELECT user_id FROM invoice_records GROUP BY user_id
           ORDER BY count(*) DESC LIMIT 1"""
    )
    if row is None:
        print("  Neon 上没有票据记录，跳过线上抽查")
        await conn.close()
        return
    token = jwt.encode(
        {"sub": str(row["user_id"]), "exp": datetime.now(timezone.utc) + timedelta(minutes=15)},
        env["JWT_SECRET"], algorithm="HS256",
    )
    await conn.close()
    H = {"Authorization": f"Bearer {token}"}

    R.section("线上抽查（云托管，只读）")
    async with httpx.AsyncClient(timeout=90, trust_env=False) as cl:
        r = await cl.get(f"{base}/health")
        h = safe_json(r)
        R.add("线上 /health", r.status_code == 200 and h.get("status") == "ok", str(h)[:60])

        r = await cl.get(f"{base}/api/me", headers=H)
        R.add("线上鉴权", r.status_code == 200,
              f"HTTP {r.status_code} {str(safe_json(r))[:50]}")

        r = await cl.get(f"{base}/api/insights/anomalies", headers=H)
        an = safe_json(r)
        R.add("线上账目体检（新接口）", r.status_code == 200 and "scanned" in an,
              f"HTTP {r.status_code} {str(an)[:60]}")

        r = await cl.get(f"{base}/api/insights/monthly-digest",
                         params={"month": "2026-10"}, headers=H)
        md = safe_json(r)
        R.add("线上月度简报（新接口）", r.status_code == 200,
              f"HTTP {r.status_code} {str(md)[:60]}")

        r = await cl.post(f"{base}/api/insights/ask", headers=H,
                          json={"question": "这个月花了多少钱"})
        a = safe_json(r)
        R.add("线上问账（新接口）", r.status_code == 200 and bool(a.get("answer")),
              f"HTTP {r.status_code} 免费剩余={a.get('free_remaining')} {str(a.get('answer'))[:30]}")

        r = await cl.get(f"{base}/api/insights/audit-report", headers=H)
        ar = safe_json(r)
        R.add("线上审单报告（新接口）", r.status_code == 200 and "summary" in ar,
              f"HTTP {r.status_code} {str(ar)[:60]}")


# ---------------------------------------------------------------------------


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prod", action="store_true", help="追加线上只读抽查")
    args = ap.parse_args()

    env = load_env()
    dsn = env["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")

    print("═" * 68)
    print("  票小助 端到端测试（模拟用户完整操作路径）")
    print(f"  目标：{'本地 + 线上' if args.prod else '本地'}")
    print("═" * 68)

    try:
        await run_journey(LOCAL_BASE, env, dsn)
    except Exception as e:
        R.add("本地流程异常中断", False, f"{type(e).__name__}: {e}")

    if args.prod:
        try:
            await prod_smoke(PROD_BASE, env, dsn)
        except Exception as e:
            R.add("线上抽查异常中断", False, f"{type(e).__name__}: {e}")

    return R.summary()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
