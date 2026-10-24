"""自然语言查账（问账）。

把「上个月食材花了多少」这类问题，变成一次安全的聚合查询。

## 为什么不直接让模型写 SQL

模型写 SQL 有三个躲不掉的问题：
1. **注入**：模型可以被提问内容诱导生成 `DROP`/跨用户查询；
2. **幻觉**：会编出不存在的表名、列名，运行时才炸；
3. **不可审计**：出了问题不知道是哪句 SQL 干的。

所以这里反过来：**模型只输出一个受约束的意图对象**（指标/维度/筛选/时间），
由本模块用 SQLAlchemy 构造器拼查询。模型再离谱，也只能在下面这几个枚举值里选。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy import func, select

from app.models.invoice import InvoiceRecord

# --------------------------------------------------------------------------- 白名单

ALLOWED_METRICS = {"sum_amount", "count", "avg_amount"}
ALLOWED_DIMENSIONS = {"category_l1", "category_l2", "merchant_name", "month"}
ALLOWED_DIRECTIONS = {"income", "out"}
ALLOWED_ORDERS = {"desc", "asc"}

MAX_LIMIT = 50
DEFAULT_LIMIT = 10


@dataclass
class QueryIntent:
    metric: str = "sum_amount"
    dimension: Optional[str] = None
    direction: Optional[str] = None
    categories: list = field(default_factory=list)
    merchant: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    limit: int = DEFAULT_LIMIT
    order: str = "desc"
    interpretation: str = ""      # 模型对问题的复述，用于「我理解的你问的是…」
    is_bookkeeping: bool = True   # 非记账问题（越权/闲聊）由模型标记，后端据此拒绝

    @property
    def valid(self) -> bool:
        return self.metric in ALLOWED_METRICS


# --------------------------------------------------------------------------- 意图解析

_SYSTEM_HINT = """你是查账助手。把用户的提问翻译成一个 JSON 查询意图，不要输出 SQL，也不要解释。

可用字段（只能从这里选，不得自造）：
- metric: sum_amount(金额合计) | count(笔数) | avg_amount(平均金额)
- dimension: category_l1(一级分类) | category_l2(二级分类) | merchant_name(商户) | month(按月份) | null(不分组)
- direction: out(支出) | income(收入) | null(不限)
- categories: 一级分类名称数组，如 ["食材"]；不确定就留空数组
- merchant: 商户名称关键词，没有就 null
- start / end: 日期，格式 YYYY-MM-DD，没有就 null
- limit: 返回条数，最多 50
- order: desc | asc（按指标值排序）
- interpretation: 用一句中文复述你的理解
- is_bookkeeping: 布尔值。问题是否属于「查这个人的收支账目」。
  若用户在问删除/修改数据、查询其他用户、与记账无关的闲聊或技术问题，填 false。

只返回 JSON 对象。"""


def parse_intent(question: str, base_url: str, api_key: str, model: str, today: Optional[date] = None) -> QueryIntent:
    """调模型把问题转成意图。任何异常都退化成「未识别」。"""
    if not api_key:
        return QueryIntent(interpretation="")

    today = today or date.today()
    user_prompt = (
        f"今天是 {today.isoformat()}（用户所在时区）。\n"
        f"用户提问：{question}\n"
    )

    try:
        resp = httpx.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": _SYSTEM_HINT},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0,
            },
            timeout=25.0,
            trust_env=False,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return QueryIntent(interpretation="")

    raw = _extract_json(content)
    if not raw:
        return QueryIntent(interpretation="")
    return _sanitize(raw)


def _extract_json(content: str) -> Optional[dict]:
    text = (content or "").strip()
    block = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if block:
        text = block.group(1)
    else:
        obj = re.search(r"\{.*\}", text, re.DOTALL)
        if obj:
            text = obj.group(0)
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def _sanitize(raw: dict) -> QueryIntent:
    """把模型输出收敛到枚举与合法格式。越界的值一律丢弃，不做猜测。"""
    intent = QueryIntent()

    metric = str(raw.get("metric") or "").strip()
    intent.metric = metric if metric in ALLOWED_METRICS else "sum_amount"

    dim = raw.get("dimension")
    dim = str(dim).strip() if dim else None
    intent.dimension = dim if dim in ALLOWED_DIMENSIONS else None

    direction = raw.get("direction")
    direction = str(direction).strip() if direction else None
    intent.direction = direction if direction in ALLOWED_DIRECTIONS else None

    cats = raw.get("categories") or []
    if isinstance(cats, str):
        cats = [cats]
    intent.categories = [str(c).strip()[:32] for c in cats if str(c).strip()][:5]

    merchant = raw.get("merchant")
    intent.merchant = str(merchant).strip()[:40] if merchant else None

    intent.start = _clean_date(raw.get("start"))
    intent.end = _clean_date(raw.get("end"))

    try:
        limit = int(raw.get("limit") or DEFAULT_LIMIT)
    except (TypeError, ValueError):
        limit = DEFAULT_LIMIT
    intent.limit = max(1, min(limit, MAX_LIMIT))

    order = str(raw.get("order") or "desc").strip()
    intent.order = order if order in ALLOWED_ORDERS else "desc"

    intent.interpretation = str(raw.get("interpretation") or "")[:120]

    # 模型判断这不是记账问题时，默认拒绝；只有明确写了 false 才算
    flag = raw.get("is_bookkeeping")
    intent.is_bookkeeping = True if flag is None else bool(flag)
    return intent


def _clean_date(value) -> Optional[str]:
    if not value:
        return None
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", str(value).strip())
    if not m:
        return None
    try:
        datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"


# --------------------------------------------------------------------------- 查询构造

def build_query(intent: QueryIntent, user_id):
    """用白名单意图拼 SQLAlchemy 查询。绝不拼接字符串。"""
    metric_col = {
        "sum_amount": func.coalesce(func.sum(InvoiceRecord.amount), 0),
        "count": func.count(),
        "avg_amount": func.coalesce(func.avg(InvoiceRecord.amount), 0),
    }[intent.metric]

    dim_col = None
    if intent.dimension == "month":
        # invoice_date 是 'YYYY-MM-DD' 字符串，取前 7 位当月
        dim_col = func.substr(InvoiceRecord.invoice_date, 1, 7)
    elif intent.dimension in ("category_l1", "category_l2", "merchant_name"):
        dim_col = getattr(InvoiceRecord, intent.dimension)

    if dim_col is not None:
        stmt = select(dim_col.label("dim"), metric_col.label("value")).group_by(dim_col)
    else:
        # 同时取笔数：用来区分「没有任何记录」和「记录合计恰为 0」——
        # 直接回「合计 ¥0.00」会让用户以为自己记错账了。
        stmt = select(metric_col.label("value"), func.count().label("n"))

    stmt = stmt.where(InvoiceRecord.user_id == user_id)

    if intent.direction:
        stmt = stmt.where(InvoiceRecord.direction == intent.direction)
    if intent.categories:
        stmt = stmt.where(InvoiceRecord.category_l1.in_(intent.categories))
    if intent.merchant:
        # 用 contains 而不是 like 拼接，避免 % 通配符注入
        stmt = stmt.where(InvoiceRecord.merchant_name.contains(intent.merchant))
    if intent.start:
        stmt = stmt.where(InvoiceRecord.invoice_date >= intent.start)
    if intent.end:
        stmt = stmt.where(InvoiceRecord.invoice_date <= intent.end)

    if dim_col is not None:
        stmt = stmt.order_by(metric_col.desc() if intent.order == "desc" else metric_col.asc())
        stmt = stmt.limit(intent.limit)

    return stmt


# --------------------------------------------------------------------------- 结果表述

_METRIC_LABEL = {"sum_amount": "金额合计", "count": "笔数", "avg_amount": "平均金额"}
_DIM_LABEL = {
    "category_l1": "分类",
    "category_l2": "二级分类",
    "merchant_name": "商户",
    "month": "月份",
}


def render(intent: QueryIntent, rows) -> str:
    """把查询结果组织成一句人话。模板化，不再调模型——省钱且稳定。"""
    if not rows:
        return "这段时间没有符合条件的记录。"

    if intent.dimension is None:
        value, n = rows[0][0], rows[0][1]
        if not n:
            return "这段时间没有符合条件的记录。"
        return _fmt_scalar(intent.metric, value, prefix="合计")

    parts = []
    for row in rows:
        dim = row[0] or "未分类"
        parts.append(f"{dim} {_fmt_scalar(intent.metric, row[1])}")

    dim_label = _DIM_LABEL.get(intent.dimension, "结果")
    head = f"按{dim_label}统计，{_METRIC_LABEL[intent.metric]}排名："
    return head + "；".join(parts) + "。"


def _fmt_scalar(metric: str, value, prefix: str = "") -> str:
    try:
        num = float(value or 0)
    except (TypeError, ValueError):
        num = 0.0
    if metric == "count":
        return f"{int(num)} 笔"
    body = f"¥{num:,.2f}"
    return f"{prefix}{body}" if prefix else body


def time_range_label(intent: QueryIntent) -> str:
    if intent.start and intent.end:
        return f"{intent.start} ~ {intent.end}"
    if intent.start:
        return f"{intent.start} 起"
    if intent.end:
        return f"截至 {intent.end}"
    return "全部时间"
