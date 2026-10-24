/**
 * AI 相关接口：问账、对话记账、审单报告、月度简报、账目体检。
 *
 * 从旧后端 `routers/insights.py` 移植，**响应字段与错误码保持一致**，
 * 前端 api.ts 不用改。
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { scan, type ScanRecord } from "../lib/anomaly";
import {
  ApiError,
  badRequest,
  isUuid,
  paymentRequired,
  serverError,
} from "../lib/http";
import { chat, formatMoney } from "../lib/llm";
import { buildQuery, parseIntent, render, timeRangeLabel } from "../lib/nlq";
import {
  chargeAsk,
  InsufficientPoints,
  recordFreeAsk,
  refundAsk,
} from "../lib/points";
import { parseEntry } from "../lib/text-entry";
import { nowIso } from "../lib/time";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

const MAX_QUESTION_LEN = 200;
const MAX_TEXT_LEN = 120;

const llmEnv = (env: Env) => ({
  baseUrl: env.LLM_BASE_URL,
  apiKey: env.LLM_API_KEY,
  model: env.LLM_MODEL_NAME,
});

/** 加载体检所需的记录字段（不要 SELECT *，体检只用这几列） */
async function loadScanRecords(
  db: D1Database,
  userId: string,
  projectId?: string | null
): Promise<Array<ScanRecord & { direction: string }>> {
  const sql = projectId
    ? `SELECT id, amount, invoice_no, invoice_code, invoice_date, merchant_name, category_l1, direction
       FROM invoice_records WHERE user_id = ? AND project_id = ?`
    : `SELECT id, amount, invoice_no, invoice_code, invoice_date, merchant_name, category_l1, direction
       FROM invoice_records WHERE user_id = ?`;
  const stmt = db.prepare(sql);
  const bound = projectId ? stmt.bind(userId, projectId) : stmt.bind(userId);
  const { results } = await bound.all<ScanRecord & { direction: string }>();
  return results ?? [];
}

// --------------------------------------------------------------------------- 问账

router.post("/insights/ask", async (c) => {
  const u = c.get("user");
  const body = await c.req.json<{ question?: string }>().catch(() => ({}) as any);
  const question = String(body?.question ?? "").trim();

  if (!question) throw badRequest("请先输入问题");
  if (question.length > MAX_QUESTION_LEN) throw badRequest("问题太长了，请精简一下");

  const ts = nowIso();

  // 计费在调用模型之前：先扣再算，避免「用完了没付账」。失败会把积分退回去。
  let charged = false;
  let freeLeft = 0;
  try {
    const res = await chargeAsk(c.env.DB, u.id, question, ts);
    charged = res.charged;
    freeLeft = res.freeLeft;
  } catch (e) {
    if (e instanceof InsufficientPoints) {
      throw paymentRequired(
        `今日免费问账次数已用完，继续提问每次需 ${e.required} 积分，当前只有 ${e.balance}。签到或购买积分包可继续使用。`
      );
    }
    throw e;
  }

  // 解析失败对这个功能是常态（模型偶发返回非 JSON），重试一次能显著改善体验；
  // 只在失败路径多花一次调用，成功率提升远大于成本。
  let intent = await parseIntent(question, llmEnv(c.env));
  if (!intent.interpretation) {
    console.warn("[ask] 意图解析失败，重试一次:", question.slice(0, 40));
    intent = await parseIntent(question, llmEnv(c.env));
  }

  if (!intent.interpretation) {
    if (charged) await refundAsk(c.env.DB, u.id, ts);
    throw serverError("暂时没法理解这个问题，请换个说法，或稍后再试");
  }

  // 顺序重要：先判「是不是查账问题」。越界提问时模型常常只返回
  // {"is_bookkeeping": false} 而不写 interpretation，先判 interpretation
  // 会让这类请求落到「没法理解」，提示词不准确。
  if (!intent.isBookkeeping) {
    if (charged) await refundAsk(c.env.DB, u.id, ts);
    throw badRequest("我只能帮你查账目数据，换个关于收支的问题试试");
  }

  const { sql, params } = buildQuery(intent, u.id);
  const { results } = await c.env.DB.prepare(sql).bind(...params).all<Record<string, unknown>>();
  const rows = results ?? [];

  // 到这里才算真正回答了问题，此时才消耗免费额度
  if (!charged) {
    await recordFreeAsk(c.env.DB, u.id, ts);
    freeLeft = Math.max(0, freeLeft - 1);
  }

  return c.json({
    question,
    interpretation: intent.interpretation,
    answer: render(intent, rows),
    time_range: timeRangeLabel(intent),
    metric: intent.metric,
    dimension: intent.dimension,
    row_count: rows.length,
    free_remaining: freeLeft,
    charged,
  });
});

// --------------------------------------------------------------------------- 对话记账

router.post("/insights/parse-text", async (c) => {
  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as any);
  const text = String(body?.text ?? "").trim();

  if (!text) throw badRequest("请说一句话，比如「昨天买菜 128」");
  if (text.length > MAX_TEXT_LEN) throw badRequest("一句话就好，别太长");

  // 与问账同样的原因：模型偶发返回非 JSON，重试一次能显著降低「没听懂」的概率
  let entry = await parseEntry(text, llmEnv(c.env));
  if (!entry || (!entry.ok && entry.missing.length === 0)) {
    console.warn("[parse-text] 解析失败，重试一次:", text.slice(0, 40));
    entry = await parseEntry(text, llmEnv(c.env));
  }

  if (!entry) {
    throw serverError("没听懂这句，换个说法试试（例如：昨天盒马买菜 128）");
  }

  return c.json({
    ok: entry.ok,
    direction: entry.direction,
    amount: entry.amount,
    merchant: entry.merchant,
    date: entry.date,
    category_l1: entry.categoryL1,
    note: entry.note,
    missing: entry.missing,
  });
});

// --------------------------------------------------------------------------- 账目体检

router.get("/insights/anomalies", async (c) => {
  const u = c.get("user");
  const projectId = c.req.query("project_id") ?? null;
  if (projectId && !isUuid(projectId)) throw notFoundProject();

  const records = await loadScanRecords(c.env.DB, u.id, projectId);
  const findings = scan(records);
  return c.json({ scanned: records.length, total: findings.length, items: findings });
});

function notFoundProject() {
  return new ApiError(404, "Project not found");
}

// --------------------------------------------------------------------------- 审单报告

router.get("/insights/audit-report", async (c) => {
  const u = c.get("user");
  const projectId = c.req.query("project_id") ?? null;
  if (projectId && !isUuid(projectId)) throw notFoundProject();

  const records = await loadScanRecords(c.env.DB, u.id, projectId);
  const findings = scan(records);

  const income = records.filter((r) => r.direction === "income").reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const expense = records.reduce((a, r) => a + Number(r.amount ?? 0), 0) - income;

  const summary = {
    record_count: records.length,
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    finding_count: findings.length,
    high_count: findings.filter((f) => f.severity === "high").length,
  };

  let advice = "";
  if (records.length > 0) {
    const lines =
      findings.slice(0, 8).map((f) => `- [${f.severity}] ${f.title}：${f.detail}`).join("\n") ||
      "- 未发现明显问题";

    // 审核意见由模型写（1 次调用）；发现与汇总都是算出来的，模型只负责组织语言，
    // 不让它参与计算——数字类结论一旦交给模型，就会有编造风险。
    const res = await chat({
      baseUrl: c.env.LLM_BASE_URL,
      apiKey: c.env.LLM_API_KEY,
      model: c.env.LLM_MODEL_NAME,
      temperature: 0.3,
      timeoutMs: 25_000,
      messages: [
        {
          role: "user",
          content:
            `你是小微企业记账审核员。根据下面的账目汇总与体检发现，写一段 120 字以内的中文审核意见。\n` +
            `要求：只针对给出的信息，不要编造数字；先说要先处理什么，再给一条改进建议。\n\n` +
            `### 汇总\n记录 ${records.length} 条，收入 ${formatMoney(income)}，支出 ${formatMoney(expense)}。\n\n` +
            `### 体检发现\n${lines}`,
        },
      ],
    });
    // 模型不可用时报告仍然可用，只是没有意见段落
    if (res.ok) advice = res.text.trim();
    else console.warn("[audit] 意见生成失败:", res.failure);
  }

  return c.json({ summary, findings, advice });
});

// --------------------------------------------------------------------------- 月度简报

function monthStats(records: Array<Record<string, unknown>>, month: string) {
  let income = 0;
  let expense = 0;
  const byCat = new Map<string, number>();
  const merchants = new Map<string, number>();

  for (const r of records) {
    const date = String(r.invoice_date ?? "");
    if (!date.startsWith(month)) continue;
    const amount = Number(r.amount ?? 0);
    if (r.direction === "income") {
      income += amount;
    } else {
      expense += amount;
      const cat = String(r.category_l1 ?? "其他");
      byCat.set(cat, (byCat.get(cat) ?? 0) + amount);
      const name = String(r.merchant_name ?? "未知商户");
      merchants.set(name, (merchants.get(name) ?? 0) + amount);
    }
  }

  const sortedCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  let topMerchant: [string, number] | null = null;
  for (const [k, v] of merchants) {
    if (!topMerchant || v > topMerchant[1]) topMerchant = [k, v];
  }

  return {
    month,
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    profit: Math.round((income - expense) * 100) / 100,
    by_category: Object.fromEntries(sortedCats.map(([k, v]) => [k, Math.round(v * 100) / 100])),
    top_merchant: topMerchant
      ? ([topMerchant[0], Math.round(topMerchant[1] * 100) / 100] as [string, number])
      : null,
  };
}

router.get("/insights/monthly-digest", async (c) => {
  const u = c.get("user");
  const projectId = c.req.query("project_id") ?? null;

  // 默认上个月
  let month = c.req.query("month") ?? "";
  if (!month) {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    month = prev.toISOString().slice(0, 7);
  }
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest("month 格式应为 YYYY-MM");

  const sql = projectId
    ? `SELECT direction, amount, invoice_date, category_l1, merchant_name FROM invoice_records
       WHERE user_id = ? AND project_id = ?`
    : `SELECT direction, amount, invoice_date, category_l1, merchant_name FROM invoice_records
       WHERE user_id = ?`;
  const stmt = c.env.DB.prepare(sql);
  const bound = projectId ? stmt.bind(u.id, projectId) : stmt.bind(u.id);
  const { results } = await bound.all<Record<string, unknown>>();

  const stats = monthStats(results ?? [], month);
  if (stats.income === 0 && stats.expense === 0) {
    return c.json({ month, has_data: false, text: `${month} 没有记录，这个月还没开始记账。` });
  }

  // 纯模板，不调模型：简报要被定时任务按月批量生成，
  // 每用户一次模型调用在用户量上来后不划算，而这里的结论都能由数据直接说清。
  const parts = [
    `${month} 收入 ${formatMoney(stats.income)}，支出 ${formatMoney(stats.expense)}，利润 ${formatMoney(stats.profit)}。`,
  ];
  const firstCat = Object.entries(stats.by_category)[0];
  if (firstCat) parts.push(`支出最多的是「${firstCat[0]}」${formatMoney(firstCat[1])}。`);
  if (stats.top_merchant) parts.push(`最大供应商是${stats.top_merchant[0]}（${formatMoney(stats.top_merchant[1])}）。`);

  return c.json({ month, has_data: true, stats, text: parts.join("") });
});

export default router;
