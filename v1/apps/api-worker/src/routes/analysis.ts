/**
 * AI 经营分析——从 `services/api/app/routers/analysis.py` 移植。
 *
 * 要点：
 *   · 汇总数据由代码计算，**不交给模型**（数字类结论一旦让模型算就会有编造风险）
 *   · 先扣积分再调模型，失败退回
 *   · 结果不落库（与旧实现一致，避免模型迁移）
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { badRequest, isUuid, notFound, paymentRequired, serverError } from "../lib/http";
import { chat, formatMoney } from "../lib/llm";
import { COST_AI_ANALYSIS, consumePoints, getBalance, logPoints } from "../lib/points";
import { nowIso } from "../lib/time";
import { getLocale, type Locale } from "../lib/locale";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

const MAX_TOKENS = 900;

interface Row {
  direction: string;
  amount: number | null;
  invoice_date: string | null;
  category_l1: string | null;
  merchant_name: string | null;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function buildPrompt(
  projectName: string,
  rows: Row[],
  locale: Locale = "zh"
): { prompt: string; summary: Record<string, unknown> } {
  const isEn = locale === "en";
  // 数据缺分类/商户/日期时的兜底文案，也要跟当前语言一致，
  // 否则英文 prompt 里会冒出「未知商户」这种中文。
  const UNCATEGORIZED = isEn ? "Uncategorized" : "其他";
  const UNKNOWN_MERCHANT = isEn ? "Unknown merchant" : "未知商户";
  const UNKNOWN_MONTH = isEn ? "Unknown" : "未知";
  let income = 0;
  let expense = 0;
  const byCat = new Map<string, number>();
  const byMerchant = new Map<string, number>();
  const byMonth = new Map<string, { income: number; expense: number }>();

  for (const r of rows) {
    const amount = Number(r.amount ?? 0);
    if (r.direction === "income") {
      income += amount;
    } else {
      expense += amount;
      const cat = r.category_l1 || UNCATEGORIZED;
      byCat.set(cat, (byCat.get(cat) ?? 0) + amount);
      const name = r.merchant_name || UNKNOWN_MERCHANT;
      byMerchant.set(name, (byMerchant.get(name) ?? 0) + amount);
    }
    const month = (r.invoice_date ?? "").slice(0, 7) || UNKNOWN_MONTH;
    const bucket = byMonth.get(month) ?? { income: 0, expense: 0 };
    if (r.direction === "income") bucket.income += amount;
    else bucket.expense += amount;
    byMonth.set(month, bucket);
  }

  const grossProfit = income - expense;
  const grossMargin = income > 0 ? (grossProfit / income) * 100 : 0;

  const categoryLines = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${formatMoney(v)}`)
    .join("\n");

  const monthlyLines = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, d]) =>
      isEn
        ? `- ${m}: revenue ${formatMoney(d.income)}, expense ${formatMoney(d.expense)}, profit ${formatMoney(d.income - d.expense)}`
        : `- ${m}: 收入 ${formatMoney(d.income)}，支出 ${formatMoney(d.expense)}，利润 ${formatMoney(d.income - d.expense)}`
    )
    .join("\n");

  const topMerchants = [...byMerchant.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, amount]) => `- ${name}: ${formatMoney(amount)}`)
    .join("\n");

  const prompt = isEn
    ? `You are a financial advisor for small businesses. Analyze the operating data below and produce a profit analysis with actionable advice.

## Project: ${projectName}

### Totals
- Revenue: ${formatMoney(income)}
- Expenses: ${formatMoney(expense)}
- Gross profit: ${formatMoney(grossProfit)}
- Gross margin: ${grossMargin.toFixed(1)}%
- Records: ${rows.length}

### Expenses by category
${categoryLines || "- No expense records"}

### Monthly revenue and expenses
${monthlyLines || "- No usable dates"}

### Top 10 merchants by expense
${topMerchants || "- No merchant data"}

Respond in English. Cover these dimensions:
1. **Profit health**: is the gross margin healthy and sustainable?
2. **Cost structure**: which costs are disproportionately high, and where is there room to optimize?
3. **Trend insight**: how are revenue and expenses trending, any abnormal swings?
4. **Merchant concentration**: is the business over-reliant on a few suppliers?
5. **Actionable advice**: 3–5 concrete actions to cut costs or improve efficiency
6. **Risk alerts**: which operating risks deserve attention?

Requirements: professional but plain-spoken; include specific numbers and executable actions; **keep it to 400–600 words**;
do not restate the data I gave you — go straight to conclusions and actions.`
    : `你是一位专业的小微商户财务顾问。请根据以下经营数据，提供利润分析与经营建议。

## 项目：${projectName}

### 总体数据
- 总收入：${formatMoney(income)}
- 总支出：${formatMoney(expense)}
- 毛利润：${formatMoney(grossProfit)}
- 毛利率：${grossMargin.toFixed(1)}%
- 记录总数：${rows.length} 条

### 支出分类明细
${categoryLines || "- 暂无支出记录"}

### 月度收支
${monthlyLines || "- 暂无可用日期"}

### 支出商户 Top 10
${topMerchants || "- 暂无商户信息"}

请从以下维度分析，用中文回答：
1. **利润健康度**：毛利率是否健康、是否可持续
2. **成本结构**：哪项成本占比过高、哪项有优化空间
3. **趋势洞察**：收入/支出趋势如何、有无异常波动
4. **商户集中度**：是否过度依赖少数供应商
5. **可落地建议**：3–5 条具体的降本增效动作
6. **风险预警**：需要关注哪些经营风险

要求：专业但易懂，给出具体数字与可执行建议；**控制在 600–800 字**，
不要复述我给你的数据，直接给结论和动作。`;

  return {
    prompt,
    summary: {
      total_income: Math.round(income * 100) / 100,
      total_expense: Math.round(expense * 100) / 100,
      gross_profit: Math.round(grossProfit * 100) / 100,
      gross_margin: Math.round(grossMargin * 10) / 10,
      record_count: rows.length,
    },
  };
}

router.post("/projects/:id/analysis", async (c) => {
  const u = c.get("user");
  const projectId = c.req.param("id");
  if (!isUuid(projectId)) throw notFound("Project not found");

  const project = await c.env.DB.prepare("SELECT name FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, u.id)
    .first<{ name: string }>();
  if (!project) throw notFound("Project not found");

  const { results } = await c.env.DB.prepare(
    `SELECT direction, amount, invoice_date, category_l1, merchant_name
     FROM invoice_records WHERE project_id = ? AND user_id = ?`
  )
    .bind(projectId, u.id)
    .all<Row>();
  const rows = results ?? [];

  if (rows.length === 0) throw badRequest("这个项目还没有任何记录，先上传几张票据再来分析");

  if (!c.env.LLM_API_KEY) throw serverError("AI 分析服务未配置（缺少 LLM_API_KEY）");

  const ts = nowIso();
  const balanceBefore = await getBalance(c.env.DB, u.id);
  if (balanceBefore < COST_AI_ANALYSIS) {
    throw paymentRequired(
      `积分不足：本次分析需 ${COST_AI_ANALYSIS} 积分，当前 ${balanceBefore}。可通过签到或购买套餐获取积分。`
    );
  }
  await consumePoints(c.env.DB, u.id, COST_AI_ANALYSIS, "consume_ai_analysis", `AI 经营分析：${project.name}`, ts);

  const locale = getLocale(c);
  const { prompt, summary } = buildPrompt(project.name, rows, locale);

  const res = await chat({
    baseUrl: c.env.LLM_BASE_URL,
    apiKey: c.env.LLM_API_KEY,
    model: c.env.LLM_MODEL_NAME,
    temperature: 0.7,
    maxTokens: MAX_TOKENS,
    // AI 分析实测 13–21 秒，超时要给足
    timeoutMs: 60_000,
    messages: [
      {
        role: "system",
        content:
          locale === "en"
            ? "You are a senior financial advisor for small businesses, skilled at spotting problems in operating data and giving practical, executable advice."
            : "你是一位资深的小微商户财务顾问，擅长从经营数据中发现问题并给出可落地的建议。",
      },
      { role: "user", content: prompt },
    ],
  });

  if (!res.ok) {
    // 没产出结果不该收钱
    await logPoints(c.env.DB, u.id, "consume_ai_analysis", COST_AI_ANALYSIS, "AI 分析失败退款", nowIso());
    throw serverError(
      locale === "en"
        ? res.failure === "timeout"
          ? "AI analysis timed out, please try again"
          : "AI analysis is temporarily unavailable, please try again"
        : res.failure === "timeout"
          ? "AI 分析超时，请稍后重试"
          : "AI 分析服务暂时不可用，请稍后重试"
    );
  }

  const balanceAfter = await getBalance(c.env.DB, u.id);
  return c.json({ analysis: res.text, summary, points_balance: balanceAfter });
});

export default router;
