"""AI 经营分析：把某项目的票据记录聚合成经营指标，交给大模型生成分析建议。

移植自 H5 端 `piaoxiaozhu-h5/app/api/analysis/route.ts`，差异：
- 数据源换成我们的 `invoice_records`（H5 用 Prisma 的 records）；
- 分析结果**不落库**（H5 存到 project.aiAnalysis）。原因：加字段要做模型迁移，
  而本功能是用户点按钮才触发的低频操作，v1 先直接返回，等确认要缓存再加。
- 未做按月 AI 次数配额（H5 有）。当前支付未开放、用户量小，先靠鉴权 + 用户主动触发控制成本；
  上线放量前应补一个 usage 统计（可复用 quota_logs）。
"""

import logging
import uuid
from decimal import Decimal
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_current_user, get_db
from app.models.invoice import InvoiceRecord
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/api", tags=["analysis"])

logger = logging.getLogger(__name__)

# 大模型超时与输出长度：实测 agnes-3.0-flash 生成约 900 字需 13–21s
# （max_tokens=600 → 13.4s/965字；max_tokens=1000 → 21.2s/880字；2000 会超过 30s）。
# 因此限制在 900 tokens、超时给 45s。
#
# ⚠️ 架构限制：微信云调用的 CallContainer 超时上限是 15s，本接口同步调用会踩线/超时。
#    若小程序走 CallContainer 内测，本功能需改成「入队 + 轮询」异步模式，
#    或让该接口走公网域名（云托管 request 上限 60s）。
LLM_TIMEOUT_SECONDS = 45.0
MAX_TOKENS = 900


def _to_float(value: Any) -> float:
    """Numeric 字段是 Decimal，统一转 float 参与求和/格式化"""
    if value is None:
        return 0.0
    return float(Decimal(str(value)))


def _build_prompt(project_name: str, records: list[InvoiceRecord], summary: dict) -> str:
    category_lines = "\n".join(
        f"- {name}: ¥{amount:.2f}"
        for name, amount in sorted(
            summary["categoryBreakdown"].items(), key=lambda kv: kv[1], reverse=True
        )
    )
    monthly_lines = "\n".join(
        f"- {month}: 收入 ¥{data['income']:.2f}，支出 ¥{data['expense']:.2f}，"
        f"利润 ¥{data['income'] - data['expense']:.2f}"
        for month, data in sorted(summary["monthlyData"].items())
    )
    top_merchants = "\n".join(
        f"- {name}: ¥{amount:.2f}" for name, amount in summary["topMerchants"]
    )

    return f"""你是一位专业的小微商户财务顾问。请根据以下经营数据，提供利润分析与经营建议。

## 项目：{project_name}

### 总体数据
- 总收入：¥{summary['totalIncome']:.2f}
- 总支出：¥{summary['totalExpense']:.2f}
- 毛利润：¥{summary['grossProfit']:.2f}
- 毛利率：{summary['grossMargin']:.1f}%
- 记录总数：{len(records)} 条

### 支出分类明细
{category_lines or "- 暂无支出记录"}

### 月度收支
{monthly_lines or "- 暂无可用日期"}

### 支出商户 Top 10
{top_merchants or "- 暂无商户信息"}

请从以下维度分析，用中文回答：
1. **利润健康度**：毛利率是否健康、是否可持续
2. **成本结构**：哪项成本占比过高、哪项有优化空间
3. **趋势洞察**：收入/支出趋势如何、有无异常波动
4. **商户集中度**：是否过度依赖少数供应商
5. **可落地建议**：3–5 条具体的降本增效动作
6. **风险预警**：需要关注哪些经营风险

要求：专业但易懂，给出具体数字与可执行建议；**控制在 600–800 字**，
不要复述我给你的数据，直接给结论和动作。"""


async def _call_llm(prompt: str) -> str:
    if not settings.LLM_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 分析服务未配置（缺少 LLM_API_KEY）",
        )

    url = f"{settings.LLM_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": settings.LLM_MODEL_NAME,
        "messages": [
            {
                "role": "system",
                "content": "你是一位资深的小微商户财务顾问，擅长从经营数据中发现问题并给出可落地的建议。",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": MAX_TOKENS,
    }

    try:
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS, trust_env=False) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {settings.LLM_API_KEY}"},
            )
    except httpx.TimeoutException as e:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI 分析超时，请稍后重试",
        ) from e
    except Exception as e:
        logger.error("调用大模型失败: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 分析服务暂时不可用",
        ) from e

    if resp.status_code != 200:
        logger.error("大模型返回 %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 分析服务暂时不可用",
        )

    content = (resp.json().get("choices") or [{}])[0].get("message", {}).get("content")
    if not content:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 分析结果为空，请重试",
        )
    return content


@router.post("/projects/{project_id}/analysis")
async def analyze_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        pid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")

    result = await db.execute(
        select(Project).where(Project.id == pid, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")

    rows = await db.execute(
        select(InvoiceRecord).where(InvoiceRecord.project_id == pid)
    )
    records = list(rows.scalars().all())

    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="暂无票据记录，请先上传票据再分析",
        )

    # ---- 聚合：总体 / 分类 / 月度 / Top 商户 ----
    total_income = 0.0
    total_expense = 0.0
    category: dict[str, float] = {}
    monthly: dict[str, dict[str, float]] = {}
    merchant: dict[str, float] = {}

    for r in records:
        amount = _to_float(r.amount)
        if r.direction == "income":
            total_income += amount
        else:
            total_expense += amount
            cat = r.category_l1 or r.category_code or "其他"
            category[cat] = category.get(cat, 0.0) + amount
            name = r.merchant_name or "未知商户"
            merchant[name] = merchant.get(name, 0.0) + amount

        month = (r.invoice_date or "")[:7] or "未知"
        bucket = monthly.setdefault(month, {"income": 0.0, "expense": 0.0})
        bucket["income" if r.direction == "income" else "expense"] += amount

    gross_profit = total_income - total_expense
    summary = {
        "totalIncome": round(total_income, 2),
        "totalExpense": round(total_expense, 2),
        "grossProfit": round(gross_profit, 2),
        "grossMargin": round(gross_profit / total_income * 100, 1) if total_income else 0.0,
        "categoryBreakdown": {k: round(v, 2) for k, v in category.items()},
        "monthlyData": {
            k: {"income": round(v["income"], 2), "expense": round(v["expense"], 2)}
            for k, v in monthly.items()
        },
        "topMerchants": [
            (name, round(amount, 2))
            for name, amount in sorted(merchant.items(), key=lambda kv: kv[1], reverse=True)[:10]
        ],
        "recordCount": len(records),
    }

    prompt = _build_prompt(project.name, records, summary)

    # 先扣积分再调模型：保证不会出现「用完了没付账」。
    # 大模型失败时退款，避免用户为一次失败的调用买单。
    from app.services import points as points_svc

    try:
        balance_after = await points_svc.consume(
            db,
            current_user.id,
            points_svc.COST_AI_ANALYSIS,
            points_svc.ACTION_CONSUME_AI,
            f"AI 经营分析：{project.name}",
        )
    except points_svc.InsufficientPoints as e:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"积分不足：本次分析需 {e.required} 积分，当前 {e.balance}。可通过签到或购买套餐获取积分。",
        )

    try:
        analysis = await _call_llm(prompt)
    except HTTPException:
        # 退款：把刚扣的积分补回去（失败的调用不该收费）
        await points_svc.grant(
            db,
            current_user.id,
            points_svc.COST_AI_ANALYSIS,
            points_svc.ACTION_CONSUME_AI,
            "AI 分析失败退款",
        )
        raise

    logger.info(
        "项目 %s AI 分析完成，记录 %s 条，扣 %s 积分，余额 %s",
        project_id,
        len(records),
        points_svc.COST_AI_ANALYSIS,
        balance_after,
    )
    return {"analysis": analysis, "summary": summary, "points_balance": balance_after}
