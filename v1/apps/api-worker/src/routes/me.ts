/** 当前用户信息与积分额度。 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { getBalance, usedThisMonth, COST_AI_ANALYSIS, COST_INVOICE_OCR } from "../lib/points";
import { badRequest } from "../lib/http";
import { daysUntil, effectivePlanCode, getPlan } from "../lib/plans";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

router.get("/me", async (c) => {
  const u = c.get("user");
  return c.json({
    id: u.id,
    openid: u.openid,
    unionid: u.unionid,
    phone: u.phone,
    nickname: u.nickname,
    avatar_url: u.avatar_url,
    plan_code: u.plan_code,
    created_at: u.created_at,
    plan_expires_at: u.plan_expires_at,
  });
});

/**
 * 更新个人资料（昵称/头像）。
 *
 * H5 的「编辑资料」页依赖它。没有这个接口时前端只能抛错，
 * 所以宁可补一个简单实现，也不要把功能砍掉。
 */
router.patch("/me", async (c) => {
  const u = c.get("user");
  const body = await c.req.json<any>().catch(() => ({}));

  const nickname = body?.nickname === undefined ? undefined : String(body.nickname).trim().slice(0, 40);
  const avatar = body?.avatar_url === undefined ? undefined : String(body.avatar_url).slice(0, 500);

  const sets: string[] = [];
  const args: unknown[] = [];
  if (nickname !== undefined) {
    if (!nickname) throw badRequest("昵称不能为空");
    sets.push("nickname = ?");
    args.push(nickname);
  }
  if (avatar !== undefined) {
    sets.push("avatar_url = ?");
    args.push(avatar || null);
  }
  if (sets.length === 0) throw badRequest("没有要更新的字段");

  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...args, u.id)
    .run();

  const fresh = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(u.id)
    .first<UserRow>();
  return c.json({
    id: fresh!.id,
    nickname: fresh!.nickname,
    avatar_url: fresh!.avatar_url,
  });
});

router.get("/me/quota", async (c) => {
  const u = c.get("user");
  const db = c.env.DB;

  // 按到期时间惰性判定有效套餐——不依赖定时任务降级，调度挂了也不会算错
  const effectiveCode = effectivePlanCode(u.plan_code, u.plan_expires_at);
  const plan = getPlan(effectiveCode);
  const [balance, used] = await Promise.all([getBalance(db, u.id), usedThisMonth(db, u.id)]);

  return c.json({
    plan_code: plan.code,
    plan_name: plan.name,
    points_balance: balance,
    points_used_this_month: used,
    points_per_month: plan.pointsGrant,
    points_cost_ocr: COST_INVOICE_OCR,
    points_cost_ai: COST_AI_ANALYSIS,
    can_export: plan.canExport,
    plan_expires_at: u.plan_expires_at,
    plan_days_left: daysUntil(u.plan_expires_at),
    plan_expired: u.plan_code !== plan.code,
    purchased_plan_code: u.plan_code,
  });
});

export default router;
