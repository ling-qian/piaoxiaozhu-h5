/**
 * 登录：小程序 code → openid → 本地用户 → JWT。
 *
 * 响应体与旧后端逐字段一致（`{access_token, user}`），前端不用改。
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { signToken } from "../lib/jwt";
import { nowIso } from "../lib/time";
import { ApiError, badRequest, serverError, unauthorized } from "../lib/http";
import { hashPassword, isValidEmail, isValidPassword, normalizeEmail, verifyPassword } from "../lib/password";

const router = new Hono<{ Bindings: Env }>();

/** 新用户注册赠送积分（与旧后端一致） */
const SIGNUP_BONUS = 30;

interface UserBrief {
  id: string;
  openid: string;
  nickname: string | null;
  avatar_url: string | null;
  phone: string | null;
  plan_code: string;
}

function toBrief(u: UserRow): UserBrief {
  return {
    id: u.id,
    openid: u.openid,
    nickname: u.nickname,
    avatar_url: u.avatar_url,
    phone: u.phone,
    plan_code: u.plan_code,
  };
}

interface JsCode2Session {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

router.post("/wechat/login", async (c) => {
  const body = await c.req.json<{ code?: string }>().catch(() => ({}) as any);
  const code = String(body?.code ?? "").trim();
  if (!code) throw badRequest("缺少 code");

  const { WX_APPID, WX_SECRET } = c.env;
  if (!WX_APPID || !WX_SECRET) throw serverError("服务端未配置小程序 AppID/Secret");

  // 与旧后端一致：超时 20s，失败区分「超时」与「连不通」，便于定位
  let data: JsCode2Session;
  try {
    const resp = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(
        WX_APPID
      )}&secret=${encodeURIComponent(WX_SECRET)}&js_code=${encodeURIComponent(
        code
      )}&grant_type=authorization_code`,
      { signal: AbortSignal.timeout(20_000) }
    );
    data = (await resp.json()) as JsCode2Session;
  } catch (e) {
    const isTimeout = e instanceof Error && /timeout|abort/i.test(e.message);
    console.error("[auth] 调用 jscode2session 失败:", e);
    throw serverError(
      isTimeout ? "微信登录服务响应超时，请稍后重试" : "微信登录服务网络不通，请稍后重试"
    );
  }

  if (data.errcode) {
    // 40029 = code 无效/已使用，属于用户侧问题，用 400 而不是 500
    throw new ApiError(400, `微信登录失败：${data.errmsg || "code 无效"}`);
  }
  if (!data.openid) throw serverError("微信未返回 openid");

  const db = c.env.DB;
  let user = await db
    .prepare("SELECT * FROM users WHERE openid = ?")
    .bind(data.openid)
    .first<UserRow>();

  if (!user) {
    // 首次登录：建用户 + 发放注册赠送积分。
    // D1 没有跨语句事务的便捷封装，这里用 batch 保证「用户与赠送」要么都成功要么都不生效。
    const id = crypto.randomUUID();
    const ts = nowIso();
    await db.batch([
      db
        .prepare(
          `INSERT INTO users (id, openid, unionid, plan_code, quota_total, quota_used, created_at)
           VALUES (?, ?, ?, 'free', 10, 0, ?)`
        )
        .bind(id, data.openid, data.unionid ?? null, ts),
      db
        .prepare(
          `INSERT INTO quota_logs (id, user_id, action, delta, reason, created_at)
           VALUES (?, ?, 'signup_bonus', ?, '新用户注册赠送', ?)`
        )
        .bind(crypto.randomUUID(), id, SIGNUP_BONUS, ts),
    ]);
    user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  } else if (data.unionid && !user.unionid) {
    await db.prepare("UPDATE users SET unionid = ? WHERE id = ?").bind(data.unionid, user.id).run();
    user.unionid = data.unionid;
  }

  if (!user) throw serverError("用户创建失败");
  const access_token = await signToken(user.id, c.env.JWT_SECRET);
  return c.json({ access_token, user: toBrief(user) });
});

// --------------------------------------------------------------------------- 邮箱登录（H5）

/**
 * 注册。
 *
 * users.openid 是 NOT NULL UNIQUE，而邮箱用户没有微信 openid，
 * 这里用 `email:<地址>` 作为占位。同一人事后若用微信登录，会得到另一个账号——
 * 账号合并需要额外的绑定流程，当前版本先不做，但字段留了位（users.email 唯一）。
 */
router.post("/email/register", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; nickname?: string }>().catch(() => ({}) as any);

  const email = normalizeEmail(String(body?.email ?? ""));
  const password = String(body?.password ?? "");

  if (!isValidEmail(email)) throw badRequest("邮箱格式不正确");
  const pw = isValidPassword(password);
  if (!pw.ok) throw badRequest(pw.reason!);

  const db = c.env.DB;
  const exists = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (exists) throw badRequest("这个邮箱已经注册过，直接登录即可");

  const id = crypto.randomUUID();
  const ts = nowIso();
  const nickname = String(body?.nickname ?? "").trim().slice(0, 40) || email.split("@")[0]!;

  // 用户与注册赠分要么都成功要么都不生效
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, openid, email, password_hash, nickname, plan_code, quota_total, quota_used, created_at)
         VALUES (?, ?, ?, ?, ?, 'free', 10, 0, ?)`
      )
      .bind(id, `email:${email}`, email, await hashPassword(password), nickname, ts),
    db
      .prepare(
        `INSERT INTO quota_logs (id, user_id, action, delta, reason, created_at)
         VALUES (?, ?, 'signup_bonus', ?, '新用户注册赠送', ?)`
      )
      .bind(crypto.randomUUID(), id, SIGNUP_BONUS, ts),
  ]);

  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  if (!user) throw serverError("用户创建失败");

  const access_token = await signToken(user.id, c.env.JWT_SECRET);
  return c.json({ access_token, user: toBrief(user) }, 201);
});

router.post("/email/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}) as any);
  const email = normalizeEmail(String(body?.email ?? ""));
  const password = String(body?.password ?? "");

  if (!isValidEmail(email) || !password) throw badRequest("请输入邮箱和密码");

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();

  // 邮箱不存在与密码错误返回同一句话：避免被用来枚举「哪些邮箱注册过」
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw unauthorized("邮箱或密码不正确");
  }

  const access_token = await signToken(user.id, c.env.JWT_SECRET);
  return c.json({ access_token, user: toBrief(user) });
});

export default router;
