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
import { ApiError, badRequest, notFound, serverError, tooManyRequests, unauthorized } from "../lib/http";
import { getLocale, pick } from "../lib/locale";
import { WECHAT_DISABLED_MESSAGE, isIntlDeployment } from "../lib/region";
import {
  hashPassword,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  passwordErrorText,
  verifyPassword,
} from "../lib/password";
import {
  CODE_TTL_SECONDS,
  MAX_ATTEMPTS,
  MAX_CODES_PER_EMAIL_PER_HOUR,
  MAX_CODES_PER_IP_PER_HOUR,
  RESEND_COOLDOWN_SECONDS,
  generateCode,
  hashCode,
  hashIp,
  sameHash,
} from "../lib/email-code";
import { sendVerificationEmail } from "../lib/email";
import { normalizePartnerCode } from "../lib/partners";
import { parseSignupSource } from "../lib/acquisition";
import { assertHuman } from "../lib/turnstile";

const router = new Hono<{ Bindings: Env }>();

/** 新用户注册赠送积分（与旧后端一致） */
const SIGNUP_BONUS = 30;

/** 请求来源 IP。Cloudflare 会把真实来源放进这个头，x-forwarded-for 只是兜底 */
function clientIp(c: { req: { header: (name: string) => string | undefined } }): string | undefined {
  const raw = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "";
  const first = raw.split(",")[0]?.trim();
  return first || undefined;
}

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
  // 海外版不提供微信登录。H5 海外版界面上本来就没有这个入口，
  // 这里再挡一层，避免有人直接调接口。
  if (isIntlDeployment(c.env)) throw notFound(WECHAT_DISABLED_MESSAGE);

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
 * 注册第一步：把六位验证码发到邮箱。
 *
 * 这一步只证明「这个地址能收信」，不创建账号。真正的账号在下一步
 * `/email/register` 里，凭验证码回填才建。
 *
 * 三重限制挡在发信之前，否则这个接口会变成免费的短信轰炸机：
 * 同一邮箱 60 秒一次、每小时最多 5 次；同一来源每小时最多 20 次；
 * 外加一层人机验证。验证码本身只存哈希，六位数字也不怕库被拖。
 */
router.post("/email/code", async (c) => {
  const locale = getLocale(c);
  const body = await c.req
    .json<{ email?: string; turnstileToken?: string }>()
    .catch(() => ({}) as any);

  const email = normalizeEmail(String(body?.email ?? ""));
  if (!isValidEmail(email)) {
    throw badRequest(pick(c, "邮箱格式不正确", "Enter a valid email address"));
  }

  const ip = clientIp(c);
  await assertHuman(c.env, body?.turnstileToken, ip, locale);

  const db = c.env.DB;
  const now = Date.now();
  const cooldownIso = new Date(now - RESEND_COOLDOWN_SECONDS * 1000).toISOString();
  const hourIso = new Date(now - 3_600_000).toISOString();

  const last = await db
    .prepare("SELECT created_at FROM email_verifications WHERE email = ? ORDER BY created_at DESC LIMIT 1")
    .bind(email)
    .first<{ created_at: string }>();
  if (last && last.created_at > cooldownIso) {
    throw tooManyRequests(
      pick(c, "验证码刚发过一次，请一分钟后再试", "A code was just sent. Wait a minute, then try again.")
    );
  }

  const byEmail = await db
    .prepare("SELECT COUNT(*) AS n FROM email_verifications WHERE email = ? AND created_at >= ?")
    .bind(email, hourIso)
    .first<{ n: number }>();
  if ((byEmail?.n ?? 0) >= MAX_CODES_PER_EMAIL_PER_HOUR) {
    throw tooManyRequests(
      pick(c, "这个邮箱一小时内请求太多，请稍后再试", "Too many codes for this address. Try again later.")
    );
  }

  const ipHash = ip ? await hashIp(ip, c.env.JWT_SECRET) : null;
  if (ipHash) {
    const byIp = await db
      .prepare("SELECT COUNT(*) AS n FROM email_verifications WHERE ip_hash = ? AND created_at >= ?")
      .bind(ipHash, hourIso)
      .first<{ n: number }>();
    if ((byIp?.n ?? 0) >= MAX_CODES_PER_IP_PER_HOUR) {
      throw tooManyRequests(
        pick(c, "请求太频繁，请稍后再试", "Too many requests from this network. Try again later.")
      );
    }
  }

  // 顺手清掉一天前的记录，这张表不必留历史
  await db
    .prepare("DELETE FROM email_verifications WHERE created_at < ?")
    .bind(new Date(now - 86_400_000).toISOString())
    .run();

  const code = generateCode();
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const expiresAt = new Date(now + CODE_TTL_SECONDS * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO email_verifications (id, email, code_hash, ip_hash, attempts, expires_at, consumed_at, created_at)
       VALUES (?, ?, ?, ?, 0, ?, NULL, ?)`
    )
    .bind(id, email, await hashCode(email, code, c.env.JWT_SECRET), ipHash, expiresAt, createdAt)
    .run();

  try {
    await sendVerificationEmail(c.env, email, code, CODE_TTL_SECONDS / 60, locale);
  } catch (e) {
    // 信没发出去，把这条记录删掉，用户可以立刻重试而不用等冷却
    await db.prepare("DELETE FROM email_verifications WHERE id = ?").bind(id).run();
    throw e;
  }

  return c.json({ ok: true, expires_in: CODE_TTL_SECONDS });
});

/**
 * 注册第二步：凭验证码建账号。
 *
 * users.openid 是 NOT NULL UNIQUE，而邮箱用户没有微信 openid，
 * 这里用 `email:<地址>` 作为占位。同一人事后若用微信登录，会得到另一个账号——
 * 账号合并需要额外的绑定流程，当前版本先不做，但字段留了位（users.email 唯一）。
 */
router.post("/email/register", async (c) => {
  const locale = getLocale(c);
  const body = await c.req
    .json<{
      email?: string;
      password?: string;
      nickname?: string;
      code?: string;
      ref?: string;
      src?: { source?: string; medium?: string; campaign?: string };
    }>()
    .catch(() => ({}) as any);

  const email = normalizeEmail(String(body?.email ?? ""));
  const password = String(body?.password ?? "");
  const code = String(body?.code ?? "").trim();

  if (!isValidEmail(email)) throw badRequest(pick(c, "邮箱格式不正确", "Enter a valid email address"));
  const pw = isValidPassword(password);
  if (!pw.ok) throw badRequest(passwordErrorText(pw.code!, locale === "en" ? "en" : "zh"));
  if (!/^\d{6}$/.test(code)) {
    throw badRequest(pick(c, "请输入邮件里的 6 位验证码", "Enter the 6-digit code from your email"));
  }

  const db = c.env.DB;
  const exists = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (exists) {
    throw badRequest(pick(c, "这个邮箱已经注册过，直接登录即可", "This email is already registered — just sign in"));
  }

  /*
   * 这里不再重复校验人机验证。
   *
   * 发码那一步已经验过一次，而这一步的准入条件是「邮箱里收到的六位码」。
   * 想知道这个码就得先拿到那封信，成本已经高过任何脚本。
   * 多验一次反而带来真实的失败：前端第二个挂件在部分浏览器或插件下面
   * 拿不到 token，用户明明收到了验证码却注册不了。
   */

  const row = await db
    .prepare(
      `SELECT id, code_hash, expires_at, attempts FROM email_verifications
       WHERE email = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`
    )
    .bind(email)
    .first<{ id: string; code_hash: string; expires_at: string; attempts: number }>();
  if (!row) {
    throw badRequest(pick(c, "请先获取邮箱验证码", "Request a verification code first"));
  }
  if (row.expires_at <= nowIso()) {
    throw badRequest(pick(c, "验证码已过期，请重新获取", "That code has expired. Request a new one."));
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    throw badRequest(pick(c, "验证码错误次数过多，请重新获取", "Too many wrong attempts. Request a new code."));
  }

  if (!sameHash(await hashCode(email, code, c.env.JWT_SECRET), row.code_hash)) {
    // 记一次失败：六位数字只有一百万种，不设上限就能被穷举
    await db
      .prepare("UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?")
      .bind(row.id)
      .run();
    throw badRequest(pick(c, "验证码不正确", "That code is not right"));
  }

  // 先抢下这条验证码的使用权。并发重复提交时只有一次能把 consumed_at 写进去
  const consumed = await db
    .prepare("UPDATE email_verifications SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
    .bind(nowIso(), row.id)
    .run();
  if ((consumed.meta.changes ?? 0) === 0) {
    throw badRequest(pick(c, "验证码已经用过，请重新获取", "That code was already used. Request a new one."));
  }

  const id = crypto.randomUUID();
  const ts = nowIso();
  const nickname = String(body?.nickname ?? "").trim().slice(0, 40) || email.split("@")[0]!;

  // 推荐码只认库里在用的合作方。码写错了不阻断注册——
  // 用户没有义务为一条推广参数停下来。
  const refCode = normalizePartnerCode(body?.ref);
  let partnerCode: string | null = null;
  if (refCode) {
    const partner = await db
      .prepare("SELECT code FROM partners WHERE code = ? AND status = 'active'")
      .bind(refCode)
      .first<{ code: string }>();
    partnerCode = partner?.code ?? null;
  }

  // 用户、注册赠分与归因要么都成功要么都不生效
  const statements = [
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
  ];
  if (partnerCode) {
    statements.push(
      db
        .prepare(
          `INSERT INTO referrals (user_id, partner_code, source, created_at)
           VALUES (?, ?, 'signup', ?)`
        )
        .bind(id, partnerCode, ts)
    );
  }

  // 渠道来源每个注册都写一行。带推荐码但没带 UTM 的注册，
  // 归到 partner，不与自然流量混在一起。
  const parsedSource = parseSignupSource(body?.src);
  const signupSource =
    partnerCode && parsedSource.source === "direct"
      ? { source: "partner", medium: "referral", campaign: null }
      : parsedSource;
  statements.push(
    db
      .prepare(
        `INSERT INTO signup_sources (user_id, source, medium, campaign, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, signupSource.source, signupSource.medium, signupSource.campaign, ts)
  );

  await db.batch(statements);

  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  if (!user) throw serverError("用户创建失败");

  const access_token = await signToken(user.id, c.env.JWT_SECRET);
  return c.json({ access_token, user: toBrief(user) }, 201);
});

/** 登录失败限流：15 分钟内同一邮箱最多 8 次、同一来源最多 30 次 */
const LOGIN_WINDOW_MINUTES = 15;
const MAX_LOGIN_FAILS_PER_EMAIL = 8;
const MAX_LOGIN_FAILS_PER_IP = 30;

router.post("/email/login", async (c) => {
  const isEn = getLocale(c) === "en";
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}) as any);
  const email = normalizeEmail(String(body?.email ?? ""));
  const password = String(body?.password ?? "");

  if (!isValidEmail(email) || !password) {
    throw badRequest(pick(c, "请输入邮箱和密码", "Enter your email and password"));
  }

  const db = c.env.DB;
  const now = Date.now();
  const since = new Date(now - LOGIN_WINDOW_MINUTES * 60_000).toISOString();
  const ip = clientIp(c);
  const ipHash = ip ? await hashIp(ip, c.env.JWT_SECRET) : null;

  // 限流要跑在校验密码之前。否则每猜一次都要算一遍 PBKDF2，
  // 挡不住请求数量，只是把攻击者的等待时间拉长。
  const [byEmail, byIp] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND created_at >= ?")
      .bind(email, since)
      .first<{ n: number }>(),
    ipHash
      ? db
          .prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND created_at >= ?")
          .bind(ipHash, since)
          .first<{ n: number }>()
      : Promise.resolve(null),
  ]);

  if (Number(byEmail?.n ?? 0) >= MAX_LOGIN_FAILS_PER_EMAIL) {
    throw tooManyRequests(
      isEn
        ? "Too many failed attempts for this email. Try again in 15 minutes."
        : "这个邮箱输错太多次，请 15 分钟后再试"
    );
  }
  if (ipHash && Number(byIp?.n ?? 0) >= MAX_LOGIN_FAILS_PER_IP) {
    throw tooManyRequests(
      isEn
        ? "Too many failed attempts from this network. Try again later."
        : "这个网络登录失败太多次，请稍后再试"
    );
  }

  const user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();

  // 邮箱不存在与密码错误返回同一句话：避免被用来枚举「哪些邮箱注册过」
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await db
      .prepare("INSERT INTO login_attempts (id, email, ip_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), email, ipHash, new Date(now).toISOString())
      .run();
    // 顺手清掉一天前的失败记录：这张表只服务于 15 分钟的窗口
    await db
      .prepare("DELETE FROM login_attempts WHERE created_at < ?")
      .bind(new Date(now - 86_400_000).toISOString())
      .run();
    throw unauthorized(isEn ? "Incorrect email or password" : "邮箱或密码不正确");
  }

  // 登录成功清掉该邮箱的失败流水，正常的几次输错不该长期占额度
  if (Number(byEmail?.n ?? 0) > 0) {
    await db.prepare("DELETE FROM login_attempts WHERE email = ?").bind(email).run();
  }

  const access_token = await signToken(user.id, c.env.JWT_SECRET);
  return c.json({ access_token, user: toBrief(user) });
});

export default router;
