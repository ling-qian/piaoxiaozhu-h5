/**
 * 自然语言查账——从 `services/api/app/services/nlq.py` 移植。
 *
 * 安全模型没有任何变化（这是整套设计的关键，别改）：
 *   1. 模型**只输出意图 JSON，不写 SQL**
 *   2. 每个字段过白名单，越界值直接丢弃而不是猜测
 *   3. SQL 由代码拼装，永远带 user_id 过滤，LIMIT 封顶
 *
 * 与旧实现的差异只在查询层：SQLAlchemy → D1 的 SQL 字符串（参数化绑定）。
 */

import { chat, extractJson, formatMoney } from "./llm";

export const ALLOWED_METRICS = ["sum_amount", "count", "avg_amount"] as const;
export const ALLOWED_DIMENSIONS = ["category_l1", "category_l2", "merchant_name", "month"] as const;
export const ALLOWED_DIRECTIONS = ["income", "out"] as const;
export const ALLOWED_ORDERS = ["desc", "asc"] as const;

export const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

export type Metric = (typeof ALLOWED_METRICS)[number];
export type Dimension = (typeof ALLOWED_DIMENSIONS)[number] | null;

export interface QueryIntent {
  metric: Metric;
  dimension: Dimension;
  direction: string | null;
  categories: string[];
  merchant: string | null;
  start: string | null;
  end: string | null;
  limit: number;
  order: string;
  interpretation: string;
  /** 非记账问题（越权/闲聊）由模型标记，后端据此拒绝且不执行任何查询 */
  isBookkeeping: boolean;
}

/** 与 Python 版逐字一致——prompt 变了，同一句话会得到不同答案 */
const SYSTEM_HINT = `你是查账助手。把用户的提问翻译成一个 JSON 查询意图，不要输出 SQL，也不要解释。

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

只返回 JSON 对象。`;

const EMPTY_INTENT: QueryIntent = {
  metric: "sum_amount",
  dimension: null,
  direction: null,
  categories: [],
  merchant: null,
  start: null,
  end: null,
  limit: DEFAULT_LIMIT,
  order: "desc",
  interpretation: "",
  isBookkeeping: true,
};

interface LlmEnv {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
}

/** 调模型把问题转成意图。任何异常都退化成「未识别」 */
export async function parseIntent(question: string, env: LlmEnv, today = new Date()): Promise<QueryIntent> {
  const todayStr = today.toISOString().slice(0, 10);
  const res = await chat({
    baseUrl: env.baseUrl,
    apiKey: env.apiKey,
    model: env.model,
    temperature: 0,
    timeoutMs: 25_000,
    messages: [
      { role: "system", content: SYSTEM_HINT },
      { role: "user", content: `今天是 ${todayStr}（用户所在时区）。\n用户提问：${question}\n` },
    ],
  });

  if (!res.ok) return { ...EMPTY_INTENT, interpretation: "" };
  const raw = extractJson(res.text);
  if (!raw) return { ...EMPTY_INTENT, interpretation: "" };
  return sanitize(raw);
}

function cleanDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // 拒绝非法日期（如 2026-02-31 会被 Date 自动进位，必须回头校验）
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

/** 把模型输出收敛到枚举与合法格式。越界的值一律丢弃，不做猜测 */
export function sanitize(raw: Record<string, unknown>): QueryIntent {
  const intent: QueryIntent = { ...EMPTY_INTENT };

  const metric = String(raw.metric ?? "").trim();
  intent.metric = (ALLOWED_METRICS as readonly string[]).includes(metric)
    ? (metric as Metric)
    : "sum_amount";

  const dim = raw.dimension ? String(raw.dimension).trim() : null;
  intent.dimension = (ALLOWED_DIMENSIONS as readonly string[]).includes(dim ?? "")
    ? (dim as Dimension)
    : null;

  const dir = raw.direction ? String(raw.direction).trim() : null;
  intent.direction = (ALLOWED_DIRECTIONS as readonly string[]).includes(dir ?? "") ? dir : null;

  const catsRaw = raw.categories;
  const cats = Array.isArray(catsRaw)
    ? catsRaw
    : typeof catsRaw === "string"
      ? [catsRaw]
      : [];
  intent.categories = cats
    .map((c) => String(c).trim().slice(0, 32))
    .filter(Boolean)
    .slice(0, 5);

  intent.merchant = raw.merchant ? String(raw.merchant).trim().slice(0, 40) : null;
  intent.start = cleanDate(raw.start);
  intent.end = cleanDate(raw.end);

  const limit = Number(raw.limit ?? DEFAULT_LIMIT);
  intent.limit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.trunc(limit), MAX_LIMIT)) : DEFAULT_LIMIT;

  const order = String(raw.order ?? "desc").trim();
  intent.order = (ALLOWED_ORDERS as readonly string[]).includes(order) ? order : "desc";

  intent.interpretation = String(raw.interpretation ?? "").slice(0, 120);

  // 模型判断不是记账问题时默认拒绝；只有明确写了 false 才算
  intent.isBookkeeping = raw.is_bookkeeping === undefined ? true : Boolean(raw.is_bookkeeping);

  return intent;
}

// --------------------------------------------------------------------------- 查询构造

export interface BuiltQuery {
  sql: string;
  params: unknown[];
}

const METRIC_SQL: Record<Metric, string> = {
  sum_amount: "COALESCE(SUM(amount), 0)",
  count: "COUNT(*)",
  avg_amount: "COALESCE(AVG(amount), 0)",
};

/**
 * 用白名单意图拼参数化 SQL。
 *
 * 维度名只可能来自 ALLOWED_DIMENSIONS，指标只可能来自 METRIC_SQL 的键，
 * 所以不存在把用户输入拼进 SQL 结构的机会；值全部走 ? 绑定。
 */
export function buildQuery(intent: QueryIntent, userId: string): BuiltQuery {
  const metricSql = METRIC_SQL[intent.metric];
  const where: string[] = ["user_id = ?"];
  const params: unknown[] = [userId];

  let dimSql: string | null = null;
  if (intent.dimension === "month") {
    // invoice_date 是 'YYYY-MM-DD'，取前 7 位当月
    dimSql = "substr(invoice_date, 1, 7)";
  } else if (intent.dimension) {
    dimSql = intent.dimension; // 已过白名单，可安全作为列名
  }

  if (intent.direction) {
    where.push("direction = ?");
    params.push(intent.direction);
  }
  if (intent.categories.length > 0) {
    where.push(`category_l1 IN (${intent.categories.map(() => "?").join(",")})`);
    params.push(...intent.categories);
  }
  if (intent.merchant) {
    // 参数绑定 + 转义通配符，避免用户输入的 % 变成通配
    where.push("merchant_name LIKE ? ESCAPE '\\'");
    params.push(`%${intent.merchant.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  }
  if (intent.start) {
    where.push("invoice_date >= ?");
    params.push(intent.start);
  }
  if (intent.end) {
    where.push("invoice_date <= ?");
    params.push(intent.end);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  if (dimSql) {
    const orderDir = intent.order === "asc" ? "ASC" : "DESC";
    return {
      sql: `SELECT ${dimSql} AS dim, ${metricSql} AS value
            FROM invoice_records ${whereSql}
            GROUP BY ${dimSql}
            ORDER BY value ${orderDir}
            LIMIT ?`,
      params: [...params, intent.limit],
    };
  }

  // 同时取笔数：区分「没有任何记录」与「记录合计恰为 0」
  return {
    sql: `SELECT ${metricSql} AS value, COUNT(*) AS n FROM invoice_records ${whereSql}`,
    params,
  };
}

// --------------------------------------------------------------------------- 结果表述

const METRIC_LABEL: Record<Metric, string> = {
  sum_amount: "金额合计",
  count: "笔数",
  avg_amount: "平均金额",
};

const DIM_LABEL: Record<string, string> = {
  category_l1: "分类",
  category_l2: "二级分类",
  merchant_name: "商户",
  month: "月份",
};

function fmtScalar(metric: Metric, value: unknown, prefix = ""): string {
  const num = Number(value ?? 0) || 0;
  if (metric === "count") return `${Math.trunc(num)} 笔`;
  const body = formatMoney(num);
  return prefix ? `${prefix}${body}` : body;
}

/** 把查询结果组织成一句人话。模板化，不再调模型——省钱且稳定 */
export function render(
  intent: QueryIntent,
  rows: Array<Record<string, unknown>>
): string {
  if (rows.length === 0) return "这段时间没有符合条件的记录。";

  if (!intent.dimension) {
    const row = rows[0]!;
    const n = Number(row.n ?? 0);
    if (!n) return "这段时间没有符合条件的记录。";
    return fmtScalar(intent.metric, row.value, "合计");
  }

  const parts = rows.map((r) => {
    const dim = (r.dim as string) || "未分类";
    return `${dim} ${fmtScalar(intent.metric, r.value)}`;
  });

  const dimLabel = DIM_LABEL[intent.dimension ?? ""] ?? "结果";
  return `按${dimLabel}统计，${METRIC_LABEL[intent.metric]}排名：${parts.join("；")}。`;
}

export function timeRangeLabel(intent: QueryIntent): string {
  if (intent.start && intent.end) return `${intent.start} ~ ${intent.end}`;
  if (intent.start) return `${intent.start} 起`;
  if (intent.end) return `截至 ${intent.end}`;
  return "全部时间";
}
