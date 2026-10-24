/**
 * 对话式记账——从 `services/api/app/services/text_entry.py` 移植。
 *
 * 为什么值得做：拍照识别只覆盖「有票」的场景。现金采购、临时买料、
 * 收据丢了的支出，用户根本没有票可拍——这条链路是唯一能接住它们的入口。
 *
 * 安全模型与问账一致：模型只输出结构化字段，不碰数据库；
 * 金额、日期、分类都要过校验，不合格就要求用户补，绝不静默入库。
 */

import { CATEGORY_L1_MAP } from "./categorize";
import { chat, extractJson } from "./llm";

/** 允许写入的分类（中文名，与库里 category_l1 的取值一致） */
export const ALLOWED_CATEGORIES: string[] = Object.values(CATEGORY_L1_MAP);

const MAX_AMOUNT = 10_000_000;

export interface ParsedEntry {
  ok: boolean;
  direction: "out" | "income";
  amount: number | null;
  merchant: string;
  date: string | null;
  categoryL1: string;
  note: string;
  missing: string[];
}

const SYSTEM_HINT = (categories: string[]) =>
  `你是记账助手。把用户的一句话解析成一条收支记录，只返回 JSON，不要解释。

字段：
- direction: "out"(支出) 或 "income"(收入)
- amount: 数字，单位元。没有明确金额时填 null
- merchant: 商户或对方名称，取不到就空字符串
- date: YYYY-MM-DD。"昨天""前天""上周三"要换算成具体日期（今天日期在用户消息里给出）
- category_l1: 必须从这个列表里选：${JSON.stringify(categories)}
- note: 一句话备注，可为空
- confidence: 0~1，你对解析结果的确信程度

只返回 JSON 对象。`;

interface LlmEnv {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
}

export async function parseEntry(
  text: string,
  env: LlmEnv,
  today = new Date()
): Promise<ParsedEntry | null> {
  if (!text.trim()) return null;

  const todayStr = today.toISOString().slice(0, 10);
  const res = await chat({
    baseUrl: env.baseUrl,
    apiKey: env.apiKey,
    model: env.model,
    temperature: 0,
    timeoutMs: 25_000,
    messages: [
      { role: "system", content: SYSTEM_HINT(ALLOWED_CATEGORIES) },
      { role: "user", content: `今天是 ${todayStr}。用户说：${text}` },
    ],
  });

  if (!res.ok) return null;
  const raw = extractJson(res.text);
  if (!raw) return null;
  return sanitize(raw, text, today);
}

function cleanDate(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  // 不接受未来日期（记账场景里多半是模型算错）
  if (dt.getTime() > Date.now() + 86_400_000) return null;
  return s;
}

export function sanitize(raw: Record<string, unknown>, originalText: string, today: Date): ParsedEntry {
  const entry: ParsedEntry = {
    ok: false,
    direction: "out",
    amount: null,
    merchant: "",
    date: today.toISOString().slice(0, 10),
    categoryL1: "其他",
    note: originalText.slice(0, 60),
    missing: [],
  };

  const dir = String(raw.direction ?? "out").trim();
  // 库里 direction 的实际取值是 out / income（见旧后端的 Literal），
  // 曾误用 "in" 导致收入记录写成库无法识别的值。
  entry.direction = dir === "income" ? "income" : "out";

  // 金额：必须是正数且在合理区间，否则视为缺失（要求用户补）
  const rawAmount = String(raw.amount ?? "")
    .replace(/[,，¥￥]/g, "")
    .trim();
  const amount = Number(rawAmount);
  if (rawAmount && Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT) {
    entry.amount = Math.round(amount * 100) / 100;
  }

  const merchant = String(raw.merchant ?? "").trim();
  entry.merchant = merchant
    ? merchant.slice(0, 80)
    : entry.direction === "income"
      ? "手工录入"
      : "";

  entry.date = cleanDate(raw.date) ?? today.toISOString().slice(0, 10);

  const cat = String(raw.category_l1 ?? "").trim();
  // 分类表是支出分类（食材/房租/工资…），收入套用会得出「客户→工资」这种误导结果，
  // 收入一律归「其他」，让用户在确认页按需改。
  entry.categoryL1 = entry.direction === "income" ? "其他" : ALLOWED_CATEGORIES.includes(cat) ? cat : "其他";

  // 缺金额没法入账；其他字段都有兜底
  if (entry.amount === null) entry.missing.push("amount");

  entry.ok = entry.amount !== null;
  return entry;
}
