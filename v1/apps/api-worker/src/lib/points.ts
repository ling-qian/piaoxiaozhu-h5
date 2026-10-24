/**
 * 积分账本。余额 = 所有流水 delta 之和（不单独存余额字段，避免两处不一致）。
 *
 * 与旧后端一致：`used_this_month` 只统计**本月负向流水**的绝对值，
 * 签到/赠送这类正向流水不计入「已消耗」。
 */
import { cnDayStartIso, cnMonthStartIso } from "./time";

/** 每张票据识别消耗 */
export const COST_INVOICE_OCR = 1;
/** 一次 AI 经营分析消耗 */
export const COST_AI_ANALYSIS = 10;
/** 超过每日免费额度后，每次问账消耗 */
export const COST_AI_ASK = 1;
/** 每天免费问账次数 */
export const DAILY_FREE_ASKS = 5;

export async function getBalance(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(delta), 0) AS bal FROM quota_logs WHERE user_id = ?")
    .bind(userId)
    .first<{ bal: number }>();
  return Number(row?.bal ?? 0);
}

/** 本月已消耗积分（正数） */
export async function usedThisMonth(db: D1Database, userId: string): Promise<number> {
  const monthStart = cnMonthStartIso();
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(-delta), 0) AS used FROM quota_logs
       WHERE user_id = ? AND delta < 0 AND created_at >= ?`
    )
    .bind(userId, monthStart)
    .first<{ used: number }>();
  return Number(row?.used ?? 0);
}

export async function logPoints(
  db: D1Database,
  userId: string,
  action: string,
  delta: number,
  reason: string | null,
  createdAt: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO quota_logs (id, user_id, action, delta, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), userId, action, delta, reason, createdAt)
    .run();
}

/** 扣积分：余额不足返回 false（不写流水） */
export async function consumePoints(
  db: D1Database,
  userId: string,
  amount: number,
  action: string,
  reason: string | null,
  createdAt: string
): Promise<{ ok: boolean; balance: number }> {
  const balance = await getBalance(db, userId);
  if (balance < amount) return { ok: false, balance };
  await logPoints(db, userId, action, -amount, reason, createdAt);
  return { ok: true, balance: balance - amount };
}

// --------------------------------------------------------------------------- 问账额度

/** 今日已问账次数（免费与付费都计入），按北京时间自然日 */
export async function asksToday(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM quota_logs
       WHERE user_id = ? AND action = 'ai_ask' AND created_at >= ?`
    )
    .bind(userId, cnDayStartIso())
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * 问账计费。返回 { charged, freeLeft }。
 *
 * 前 DAILY_FREE_ASKS 次免费；超出后每次扣 COST_AI_ASK。
 *
 * **免费次数在「成功之后」才记账**（见 recordFreeAsk）：额度判断只读不写，
 * 这样模型临时失败时不会白白消耗用户的免费次数——曾经先记账后解析，
 * 一次 503 就吃掉一次额度，用户会觉得「问了一句就少一次」。
 */
export async function chargeAsk(
  db: D1Database,
  userId: string,
  question: string,
  createdAt: string
): Promise<{ charged: boolean; freeLeft: number }> {
  const used = await asksToday(db, userId);
  if (used < DAILY_FREE_ASKS) return { charged: false, freeLeft: DAILY_FREE_ASKS - used };

  const res = await consumePoints(db, userId, COST_AI_ASK, "ai_ask", `问账：${question.slice(0, 30)}`, createdAt);
  if (!res.ok) throw new InsufficientPoints(COST_AI_ASK, res.balance);
  return { charged: true, freeLeft: 0 };
}

/** 成功回答一次免费问账后记账（delta=0，不动余额，只用于计数） */
export async function recordFreeAsk(db: D1Database, userId: string, createdAt: string): Promise<void> {
  const used = await asksToday(db, userId);
  await logPoints(db, userId, "ai_ask", 0, `免费问账（今日第 ${used + 1}/${DAILY_FREE_ASKS} 次）`, createdAt);
}

/** 问账失败时退回积分（只对已扣费的那次生效） */
export async function refundAsk(db: D1Database, userId: string, createdAt: string): Promise<void> {
  await logPoints(db, userId, "ai_ask", COST_AI_ASK, "问账失败退款", createdAt);
}

export class InsufficientPoints extends Error {
  constructor(
    public required: number,
    public balance: number
  ) {
    super(`积分不足：需要 ${required}，当前 ${balance}`);
  }
}
