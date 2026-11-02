/**
 * 付费套餐意向。
 *
 * 支付通道没接完时，Pro 的购买按钮改成「留邮箱，开通后通知」。
 * 这里只负责把邮箱记下来，不发信、不建订单，也不改用户套餐。
 * 真正的通知等支付开通后，由运营按这张表逐一发。
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { badRequest } from "../lib/http";
import { isValidEmail, normalizeEmail } from "../lib/password";
import { nowIso } from "../lib/time";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

/** 只有付费套餐需要意向登记，免费版没有购买动作 */
const ALLOWED_PLANS = new Set(["pro", "enterprise"]);

router.post("/plan-interest", async (c) => {
  const user = c.get("user");

  let body: { planCode?: string; email?: string };
  try {
    body = await c.req.json();
  } catch {
    throw badRequest("请求体格式不正确");
  }

  const planCode = String(body.planCode ?? "").trim();
  if (!ALLOWED_PLANS.has(planCode)) throw badRequest("套餐不存在");

  // 用户默认用登录邮箱；也允许填别的地址，比如老板自己的邮箱
  const email = normalizeEmail(String(body.email || user.email || ""));
  if (!isValidEmail(email)) throw badRequest("邮箱格式不正确");

  // 同一个邮箱对同一个套餐重复提交时，只更新归属用户，不新增行
  await c.env.DB.prepare(
    `INSERT INTO plan_interest (id, user_id, email, plan_code, created_at, notified_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT(email, plan_code) DO UPDATE SET user_id = excluded.user_id`
  )
    .bind(crypto.randomUUID(), user.id, email, planCode, nowIso())
    .run();

  return c.json({ ok: true });
});

export default router;
