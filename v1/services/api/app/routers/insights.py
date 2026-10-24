"""账目体检接口：只读扫描，不扣积分。

为什么不收费：纯本地计算，没有模型调用成本；而且它承担的是「让用户回来看一眼」
的作用——越是免费且有用的检查，越能带来复访。
"""

import logging
from typing import Optional
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from starlette.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceRecord
from app.models.project import Project
from app.models.user import User
from app.config import settings
from app.services import anomaly, nlq, text_entry
from app.services import points as points_svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["insights"])


@router.get("/insights/anomalies")
async def list_anomalies(
    project_id: Optional[str] = Query(None, description="不传则扫描该用户全部项目"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """扫描票据，返回值得关注的账目问题。"""
    stmt = select(InvoiceRecord).where(InvoiceRecord.user_id == current_user.id)

    if project_id:
        try:
            uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        # 归属校验：否则能拿别人的 project_id 扫别人的账
        owned = await db.execute(
            select(Project.id).where(Project.id == project_id, Project.user_id == current_user.id)
        )
        if owned.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        stmt = stmt.where(InvoiceRecord.project_id == project_id)

    rows = (await db.execute(stmt)).scalars().all()
    findings = anomaly.scan(rows)

    return {
        "scanned": len(rows),
        "total": len(findings),
        "items": [f.to_dict() for f in findings[:limit]],
    }


@router.post("/insights/ask")
async def ask_question(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """自然语言查账。

    成本：每次 1 次模型调用（只用来解析意图），结果的表述由模板生成。
    安全：模型输出经白名单收敛，查询用 SQLAlchemy 构造器拼装，且强制带 user_id。
    """
    question = str((body or {}).get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先输入问题")
    if len(question) > 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="问题太长了，请精简一下")

    # 计费在调用模型之前：先扣再算，避免「用完了没付账」。
    # 前 5 次免费，超出每次 1 积分；失败会把积分退回去。
    try:
        charged, free_left = await points_svc.charge_ask(db, current_user.id, question)
    except points_svc.InsufficientPoints as e:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"今日免费问账次数已用完，继续提问每次需 {e.required} 积分，"
                f"当前只有 {e.balance}。签到或购买积分包可继续使用。"
            ),
        )

    # 解析失败对这个功能是常态（模型偶发返回非 JSON），重试一次能显著改善体验；
    # 只在失败路径多花一次调用，成功率提升远大于成本。
    intent = None
    for attempt in range(2):
        try:
            intent = await run_in_threadpool(
                nlq.parse_intent,
                question,
                settings.LLM_BASE_URL,
                settings.LLM_API_KEY,
                settings.LLM_MODEL_NAME,
            )
        except Exception:
            intent = None
        if intent is not None and intent.interpretation:
            break
        if attempt == 0:
            logger.info("问账意图解析失败，重试一次: %s", question[:40])

    if intent is None or not intent.interpretation:
        if charged:
            await points_svc.refund_ask(db, current_user.id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="暂时没法理解这个问题，请换个说法，或稍后再试",
        )

    # 顺序很重要：先判「是不是查账问题」。
    # 越界提问时模型常常只返回 {"is_bookkeeping": false} 而不写 interpretation，
    # 先判 interpretation 会让这类请求落到「没法理解」，提示词不准确。
    if not intent.is_bookkeeping:
        # 没查到任何数据，不该收钱
        if charged:
            await points_svc.refund_ask(db, current_user.id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="我只能帮你查账目数据，换个关于收支的问题试试",
        )

    stmt = nlq.build_query(intent, current_user.id)
    rows = (await db.execute(stmt)).all()

    # 到这里才算真正回答了问题，此时才消耗免费额度
    if not charged:
        await points_svc.record_free_ask(db, current_user.id)
        free_left = max(0, free_left - 1) if free_left else 0

    return {
        "question": question,
        "interpretation": intent.interpretation,
        "answer": nlq.render(intent, rows),
        "time_range": nlq.time_range_label(intent),
        "metric": intent.metric,
        "dimension": intent.dimension,
        "row_count": len(rows),
        "free_remaining": free_left,
        "charged": charged,
    }


@router.post("/insights/parse-text")
async def parse_text_entry(
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """把一句话解析成记账草稿（**不入库**）。

    分两步是为了让用户确认：模型解析错了立刻能改，
    而不是等写进库里再发现账目不对。
    """
    text = str((body or {}).get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请说一句话，比如「昨天买菜 128」")
    if len(text) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="一句话就好，别太长")

    # 与问账同样的原因：模型偶发返回非 JSON，重试一次能显著降低「没听懂」的概率。
    # 只在失败路径多花一次调用，成功路径零额外成本。
    entry = None
    for attempt in range(2):
        entry = await run_in_threadpool(
            text_entry.parse_entry,
            text,
            settings.LLM_BASE_URL,
            settings.LLM_API_KEY,
            settings.LLM_MODEL_NAME,
        )
        if entry.ok or entry.missing:
            break
        if attempt == 0:
            logger.info("对话记账解析失败，重试一次: %s", text[:40])

    if not entry.ok and not entry.missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="没听懂这句，换个说法试试（例如：昨天盒马买菜 128）",
        )

    return entry.to_dict()


# --------------------------------------------------------------------------- 月度简报

def _month_stats(records, month: str) -> dict:
    """按月份汇总收支，供简报与审单报告共用。"""
    income = expense = 0.0
    by_cat: dict[str, float] = {}
    merchants: dict[str, float] = {}
    for r in records:
        if not (r.invoice_date or "").startswith(month):
            continue
        amount = float(r.amount or 0)
        if r.direction == "income":
            income += amount
        else:
            expense += amount
            cat = r.category_l1 or "其他"
            by_cat[cat] = by_cat.get(cat, 0.0) + amount
            name = r.merchant_name or "未知商户"
            merchants[name] = merchants.get(name, 0.0) + amount
    return {
        "month": month,
        "income": round(income, 2),
        "expense": round(expense, 2),
        "profit": round(income - expense, 2),
        "by_category": {k: round(v, 2) for k, v in sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True)},
        "top_merchant": (max(merchants.items(), key=lambda kv: kv[1]) if merchants else None),
    }


@router.get("/insights/monthly-digest")
async def monthly_digest(
    month: Optional[str] = Query(None, description="YYYY-MM，默认上个月"),
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """月度经营简报：给订阅消息/首页卡片用的一段话。

    不带模型：纯模板拼装。简报要被定时任务按月批量生成，
    每用户一次模型调用在用户量上来后不划算；而这里的结论都能由数据直接说清。
    """
    from datetime import date as _date

    if not month:
        first = _date.today().replace(day=1)
        prev = first - __import__("datetime").timedelta(days=1)
        month = f"{prev.year:04d}-{prev.month:02d}"

    try:
        datetime.strptime(month, "%Y-%m")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="month 格式应为 YYYY-MM")

    stmt = select(InvoiceRecord).where(InvoiceRecord.user_id == current_user.id)
    if project_id:
        stmt = stmt.where(InvoiceRecord.project_id == project_id)
    records = (await db.execute(stmt)).scalars().all()

    stats = _month_stats(records, month)
    if stats["income"] == 0 and stats["expense"] == 0:
        return {"month": month, "has_data": False, "text": f"{month} 没有记录，这个月还没开始记账。"}

    parts = [f"{month} 收入 ¥{stats['income']:,.2f}，支出 ¥{stats['expense']:,.2f}，利润 ¥{stats['profit']:,.2f}。"]
    if stats["by_category"]:
        top_cat, top_amt = next(iter(stats["by_category"].items()))
        parts.append(f"支出最多的是「{top_cat}」¥{top_amt:,.2f}。")
    if stats["top_merchant"]:
        name, amt = stats["top_merchant"]
        parts.append(f"最大供应商是{name}（¥{amt:,.2f}）。")

    return {
        "month": month,
        "has_data": True,
        "stats": stats,
        "text": "".join(parts),
    }


# --------------------------------------------------------------------------- 审单报告

@router.get("/insights/audit-report")
async def audit_report(
    project_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI 审单报告：体检发现 + 收支汇总 + 一段审核意见。

    审核意见由模型写（1 次调用）；发现与汇总都是算出来的，模型只负责组织语言，
    不让它参与计算——数字类结论一旦交给模型，就会有编造风险。
    """
    stmt = select(InvoiceRecord).where(InvoiceRecord.user_id == current_user.id)
    if project_id:
        try:
            uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        stmt = stmt.where(InvoiceRecord.project_id == project_id)

    records = (await db.execute(stmt)).scalars().all()
    findings = anomaly.scan(records)

    income = sum(float(r.amount or 0) for r in records if r.direction == "income")
    expense = sum(float(r.amount or 0) for r in records if r.direction == "out")
    high = sum(1 for f in findings if f.severity == "high")

    summary = {
        "record_count": len(records),
        "income": round(income, 2),
        "expense": round(expense, 2),
        "finding_count": len(findings),
        "high_count": high,
    }

    advice = ""
    if records:
        lines = "\n".join(f"- [{f.severity}] {f.title}：{f.detail}" for f in findings[:8]) or "- 未发现明显问题"
        prompt = (
            "你是小微企业记账审核员。根据下面的账目汇总与体检发现，写一段 120 字以内的中文审核意见。\n"
            "要求：只针对给出的信息，不要编造数字；先说要先处理什么，再给一条改进建议。\n\n"
            f"### 汇总\n记录 {len(records)} 条，收入 ¥{income:,.2f}，支出 ¥{expense:,.2f}。\n\n"
            f"### 体检发现\n{lines}"
        )
        try:
            import httpx

            def _call() -> str:
                resp = httpx.post(
                    f"{settings.LLM_BASE_URL.rstrip('/')}/chat/completions",
                    headers={"Authorization": f"Bearer {settings.LLM_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": settings.LLM_MODEL_NAME,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                    },
                    timeout=25.0,
                    trust_env=False,
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"].strip()

            if settings.LLM_API_KEY:
                advice = await run_in_threadpool(_call)
        except Exception as e:
            # 模型不可用时报告仍然可用，只是没有意见段落
            logger.warning("审单报告的意见生成失败: %s", e)

    return {
        "summary": summary,
        "findings": [f.to_dict() for f in findings],
        "advice": advice,
    }
