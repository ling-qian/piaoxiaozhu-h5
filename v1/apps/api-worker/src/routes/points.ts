/**
 * 积分与签到。
 *
 * 对齐旧 FastAPI 后端的 `/api/points*` 系列接口，让 H5 与小程序用同一套语义：
 * 余额是流水之和、签到按北京时间切日界、积分包只发积分不改套餐。
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { badRequest } from "../lib/http";
import { POINT_PACKAGES, packagePrice } from "../lib/plans";
import {
  COST_AI_ANALYSIS,
  COST_INVOICE_OCR,
  DAILY_CHECKIN_REWARD,
  SIGNUP_BONUS,
  checkinCalendar,
  checkedInToday,
  dailyCheckin,
  getBalance,
  listLogs,
} from "../lib/points";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

/**
 * 当前余额与今日签到状态。首页和「我的」页都要用它。
 *
 * 字段名对齐小程序端已上线的读法（checkin_reward / signup_bonus / costs），
 * 不能只返回 reward——小程序读不到会显示 0，看起来像功能坏了。
 */
router.get("/points", async (c) => {
  const u = c.get("user");
  const [balance, checked] = await Promise.all([
    getBalance(c.env.DB, u.id),
    checkedInToday(c.env.DB, u.id),
  ]);
  return c.json({
    balance,
    checked_in_today: checked,
    checkin_reward: DAILY_CHECKIN_REWARD,
    signup_bonus: SIGNUP_BONUS,
    costs: {
      invoice_ocr: COST_INVOICE_OCR,
      ai_analysis: COST_AI_ANALYSIS,
    },
  });
});

/** 积分流水 */
router.get("/points/logs", async (c) => {
  const u = c.get("user");
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 30), 1), 100);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  const { items, total } = await listLogs(c.env.DB, u.id, limit, offset);
  return c.json({ items, total });
});

/**
 * 每日签到。
 *
 * 重复签到返回 400 而不是静默成功：前端要靠这个状态码显示「今天已签过」，
 * 静默成功会让用户以为又领了一次。
 */
router.post("/points/checkin", async (c) => {
  const u = c.get("user");
  try {
    const balance = await dailyCheckin(c.env.DB, u.id);
    return c.json({
      balance,
      earned: DAILY_CHECKIN_REWARD,
      message: `签到成功，+${DAILY_CHECKIN_REWARD} 积分`,
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("已经签过")) {
      throw badRequest(e.message);
    }
    throw e;
  }
});

/** 签到日历：某月的签到日期、连续天数、本月天数、余额 */
router.get("/points/checkin/calendar", async (c) => {
  const u = c.get("user");
  const month = c.req.query("month") ?? undefined;
  try {
    const data = await checkinCalendar(c.env.DB, u.id, month);
    return c.json(data);
  } catch (e) {
    if (e instanceof Error && e.message.includes("month")) {
      throw badRequest(e.message);
    }
    throw e;
  }
});

/**
 * 可购买的积分包。只发积分，不改套餐与到期时间。
 *
 * 同时给出人民币与美元标价，由前端按当前语言/地区选一个展示。
 * 不给「已换算好的单一价格」是因为换算逻辑一旦放前端，两端就可能算出不同金额，
 * 而支付金额必须唯一。
 */
router.get("/points/packages", async (c) => {
  return c.json({
    items: Object.values(POINT_PACKAGES).map((p) => ({
      code: p.code,
      name: p.name,
      points: p.points,
      price_cents_cny: packagePrice(p, "CNY"),
      price_cents_usd: packagePrice(p, "USD"),
      price_yuan: packagePrice(p, "CNY") / 100,
      price_usd: packagePrice(p, "USD") / 100,
    })),
  });
});

export default router;
