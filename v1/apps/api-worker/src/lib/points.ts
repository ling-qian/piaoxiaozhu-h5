/**
 * 积分账本。余额 = 所有流水 delta 之和（不单独存余额字段，避免两处不一致）。
 *
 * 与旧后端一致：`used_this_month` 只统计**本月负向流水**的绝对值，
 * 签到/赠送这类正向流水不计入「已消耗」。
 */
import { cnDateString, cnDayStartIso, cnMonthStartIso, cnToday, nowIso } from "./time";

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

// ────────────────────────────────────────────────────────────
// 签到
// ────────────────────────────────────────────────────────────

/** 每日签到奖励 */
export const DAILY_CHECKIN_REWARD = 2;
/** 注册赠送，够 30 张票或 3 次 AI 分析 */
export const SIGNUP_BONUS = 30;
/** 签到流水的 action 标记，查询当日是否已签全靠它 */
export const ACTION_CHECKIN = "daily_checkin";

/** 今天是否已签到（按北京时间自然日） */
export async function checkedInToday(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM quota_logs
       WHERE user_id = ? AND action = ? AND created_at >= ?`
    )
    .bind(userId, ACTION_CHECKIN, cnDayStartIso())
    .first<{ n: number }>();
  return Number(row?.n ?? 0) > 0;
}

/**
 * 签到并发积分，返回新余额。
 * 今天已签过时抛 ValueError 等价物（普通 Error），由路由转成 400。
 */
export async function dailyCheckin(db: D1Database, userId: string): Promise<number> {
  if (await checkedInToday(db, userId)) {
    throw new Error("今天已经签过到了，明天再来");
  }
  await logPoints(db, userId, ACTION_CHECKIN, DAILY_CHECKIN_REWARD, "每日签到", nowIso());
  return getBalance(db, userId);
}

/** 该用户全部已签到日期（北京时间，升序去重）。签到记录量小，全量取即可 */
export async function checkinDates(db: D1Database, userId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT created_at FROM quota_logs WHERE user_id = ? AND action = ?")
    .bind(userId, ACTION_CHECKIN)
    .all<{ created_at: string }>();

  const set = new Set<string>();
  for (const r of results ?? []) {
    const d = cnDateString(r.created_at);
    if (d) set.add(d);
  }
  return [...set].sort();
}

/**
 * 连续签到天数。
 * 今天还没签时从昨天开始数——否则早上打开小程序会看到「连续 0 天」，
 * 把已经攒起来的记录显得像断了。
 */
export function computeStreak(dates: Set<string>, today: string): number {
  const day = new Date(`${today}T00:00:00Z`);
  if (!dates.has(today)) day.setUTCDate(day.getUTCDate() - 1);

  let streak = 0;
  while (dates.has(day.toISOString().slice(0, 10))) {
    streak += 1;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return streak;
}

/** 签到日历数据 */
export async function checkinCalendar(
  db: D1Database,
  userId: string,
  month?: string
): Promise<{
  month: string;
  today: string;
  checked_dates: string[];
  today_checked_in: boolean;
  month_count: number;
  streak: number;
  balance: number;
  reward: number;
}> {
  const today = cnToday();
  const target = month || today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(target)) {
    throw new Error("month 格式应为 YYYY-MM");
  }

  const all = await checkinDates(db, userId);
  const allSet = new Set(all);
  const monthDates = all.filter((d) => d.startsWith(target));

  return {
    month: target,
    today,
    checked_dates: monthDates,
    today_checked_in: allSet.has(today),
    month_count: monthDates.length,
    streak: computeStreak(allSet, today),
    balance: await getBalance(db, userId),
    reward: DAILY_CHECKIN_REWARD,
  };
}



/** 积分流水（最近的在前） */
export async function listLogs(
  db: D1Database,
  userId: string,
  limit = 30,
  offset = 0
): Promise<{ items: { id: string; action: string; delta: number; reason: string | null; created_at: string }[]; total: number }> {
  const totalRow = await db
    .prepare("SELECT COUNT(*) AS n FROM quota_logs WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>();

  const { results } = await db
    .prepare(
      `SELECT id, action, delta, reason, created_at FROM quota_logs
       WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(userId, limit, offset)
    .all<{ id: string; action: string; delta: number; reason: string | null; created_at: string }>();

  return { items: results ?? [], total: Number(totalRow?.n ?? 0) };
}
