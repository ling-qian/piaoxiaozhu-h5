"""对话式记账：把「昨天盒马买菜 128」变成一条结构化记录。

为什么值得做：拍照识别只覆盖「有票」的场景。现金采购、临时买料、收据丢了的支出，
用户根本没有票可拍——这条链路是唯一能接住它们的入口。

安全与正确性的做法和问账一致：**模型只输出结构化字段，不碰数据库**。
金额、日期、分类都要过校验，任何一项不合格就要求用户确认或重说，绝不静默入库。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

import httpx

from piaoxiaozhu_core.categorize import CATEGORY_L1_MAP

# 允许写入的分类（用中文名，与库里 category_l1 的取值一致）
ALLOWED_CATEGORIES = list(CATEGORY_L1_MAP.values())   # ['食材','房租','工资',...]
ALLOWED_DIRECTIONS = {"income", "out"}

MAX_AMOUNT = 10_000_000


@dataclass
class ParsedEntry:
    ok: bool = False
    direction: str = "out"
    amount: Optional[float] = None
    merchant: str = ""
    record_date: Optional[str] = None     # YYYY-MM-DD
    category_l1: str = "其他"
    note: str = ""
    missing: list = None                  # 缺失或不合格的字段，前端据此提示

    def __post_init__(self):
        if self.missing is None:
            self.missing = []

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "direction": self.direction,
            "amount": self.amount,
            "merchant": self.merchant,
            "date": self.record_date,
            "category_l1": self.category_l1,
            "note": self.note,
            "missing": self.missing,
        }


_SYSTEM_HINT = f"""你是记账助手。把用户的一句话解析成一条收支记录，只返回 JSON，不要解释。

字段：
- direction: "out"(支出) 或 "income"(收入)
- amount: 数字，单位元。没有明确金额时填 null
- merchant: 商户或对方名称，取不到就空字符串
- date: YYYY-MM-DD。"昨天""前天""上周三"要换算成具体日期（今天日期在用户消息里给出）
- category_l1: 必须从这个列表里选：{ALLOWED_CATEGORIES}
- note: 一句话备注，可为空
- confidence: 0~1，你对解析结果的确信程度

只返回 JSON 对象。"""


def parse_entry(text: str, base_url: str, api_key: str, model: str, today: Optional[date] = None) -> ParsedEntry:
    """解析一句话为记录草稿。失败返回 ok=False，由前端提示用户重说。"""
    if not api_key or not text.strip():
        return ParsedEntry()

    today = today or date.today()
    try:
        resp = httpx.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": _SYSTEM_HINT},
                    {"role": "user", "content": f"今天是 {today.isoformat()}。用户说：{text}"},
                ],
                "temperature": 0,
            },
            timeout=25.0,
            trust_env=False,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return ParsedEntry()

    raw = _extract_json(content)
    if not raw:
        return ParsedEntry()
    return _sanitize(raw, text, today)


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


def _sanitize(raw: dict, original_text: str, today: date) -> ParsedEntry:
    entry = ParsedEntry(note=original_text[:60])

    direction = str(raw.get("direction") or "out").strip()
    # 库里 direction 的实际取值是 out / income（见 app/schemas/record.py 的 Literal），
    # 曾误用 "in"，导致收入记录被写成库无法识别的值。
    entry.direction = direction if direction in ALLOWED_DIRECTIONS else "out"

    # 金额：必须是正数且在合理区间，否则视为缺失（要求用户补）
    amount = raw.get("amount")
    try:
        value = float(str(amount).replace(",", "").replace("¥", "").strip())
        if 0 < value <= MAX_AMOUNT:
            entry.amount = round(value, 2)
    except (TypeError, ValueError):
        pass

    merchant = str(raw.get("merchant") or "").strip()
    entry.merchant = merchant[:80] if merchant else ("手工录入" if entry.direction == "income" else "")

    entry.record_date = _clean_date(raw.get("date")) or today.isoformat()

    cat = str(raw.get("category_l1") or "").strip()
    # 分类表是支出分类（食材/房租/工资…），收入套用会得出「客户→工资」这种误导结果，
    # 收入一律归「其他」，让用户在确认页按需改。
    if entry.direction == "income":
        entry.category_l1 = "其他"
    else:
        entry.category_l1 = cat if cat in ALLOWED_CATEGORIES else "其他"

    # 缺金额没法入账；其他字段都有兜底
    if entry.amount is None:
        entry.missing.append("amount")

    entry.ok = entry.amount is not None
    return entry


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
    # 不接受未来日期（记账场景里多半是模型算错）
    if date(int(m.group(1)), int(m.group(2)), int(m.group(3))) > date.today() + timedelta(days=1):
        return None
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
