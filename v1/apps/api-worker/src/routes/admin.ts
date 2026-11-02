/**
 * 后台管理接口。
 *
 * ## 鉴权
 *
 * 单令牌：请求头 `X-Admin-Token` 必须等于 `ADMIN_TOKEN`。未配置 `ADMIN_TOKEN`
 * 时一律 403（默认关闭）——不能因为忘了配环境变量就变成人人可进。
 *
 * 为什么不用账号体系：现阶段只有一两个人看数据，单令牌够用。角色权限、
 * 操作审计这些等到真的有多人协作再上，过早做往往做错。
 *
 * ## 与旧 FastAPI 后端的差异
 *
 * `/diagnostics/egress` 没了。那个接口用来诊断云托管容器出不去网、
 * TLS 被中间人代理拦截的问题。Cloudflare Worker 的出网不走容器网络，
 * 这个问题不存在。取而代之的是 `/admin/diagnostics/wechat`，检查
 * 微信凭证配置是否正确——这才是 Worker 上真正会配错的地方。
 */
import { Hono } from "hono";

import type { Env } from "../env";
import { badRequest, forbidden, notFound, serverError, unauthorized } from "../lib/http";
import { sameHash } from "../lib/email-code";
import { generatePartnerCode } from "../lib/partners";
import { WECHAT_DISABLED_MESSAGE, isIntlDeployment } from "../lib/region";
import { nowIso } from "../lib/time";

const router = new Hono<{ Bindings: Env }>();

/** 手机号打码：保留前三后四。后台不应该看到完整号码 */
function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/** 邮箱打码：只留首字母和域名 */
function maskEmail(email: string | null): string | null {
  if (!email) return email;
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** 分页参数规整。size 上限 100，避免有人传 100000 把库拖垮 */
function pageArgs(pageRaw: string | undefined, sizeRaw: string | undefined, defaultSize = 20) {
  const page = Math.max(Number(pageRaw ?? 1) || 1, 1);
  const size = Math.min(Math.max(Number(sizeRaw ?? defaultSize) || defaultSize, 1), 100);
  return { page, size, limit: size, offset: (page - 1) * size };
}

/** 令牌校验。放在每个 handler 开头显式调用，比中间件更容易看出哪个接口受保护 */
function requireAdmin(c: { env: Env; req: { header: (k: string) => string | undefined } }): void {
  const expected = c.env.ADMIN_TOKEN;
  if (!expected) {
    throw forbidden("管理后台未启用：请在 Worker 配置 ADMIN_TOKEN");
  }
  const got = c.req.header("X-Admin-Token");
  // 恒定时间比较：普通字符串比较会按前缀长度提前返回，
  // 理论上能被用来一位一位试探令牌。
  if (!got || !sameHash(got, expected)) {
    throw unauthorized("管理令牌无效");
  }
}

/** 首屏概览：用户/订单/金额/记录/积分五个口径 */
router.get("/admin/overview", async (c) => {
  requireAdmin(c);
  const db = c.env.DB;

  const [users, usersToday, orders, ordersPaid, revenue, records, projects, issued, used] =
    await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>(),
      db
        .prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?")
        .bind(todayStartUtc())
        .first<{ n: number }>(),
      db.prepare("SELECT COUNT(*) AS n FROM orders").first<{ n: number }>(),
      db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'").first<{ n: number }>(),
      db
        .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM orders WHERE status = 'paid'")
        .first<{ s: number }>(),
      db.prepare("SELECT COUNT(*) AS n FROM invoice_records").first<{ n: number }>(),
      db.prepare("SELECT COUNT(*) AS n FROM projects").first<{ n: number }>(),
      db
        .prepare("SELECT COALESCE(SUM(delta), 0) AS s FROM quota_logs WHERE delta > 0")
        .first<{ s: number }>(),
      db
        .prepare("SELECT COALESCE(SUM(delta), 0) AS s FROM quota_logs WHERE delta < 0")
        .first<{ s: number }>(),
    ]);

  return c.json({
    users: { total: Number(users?.n ?? 0), today: Number(usersToday?.n ?? 0) },
    orders: { total: Number(orders?.n ?? 0), paid: Number(ordersPaid?.n ?? 0) },
    revenue_cents: Number(revenue?.s ?? 0),
    records: Number(records?.n ?? 0),
    projects: Number(projects?.n ?? 0),
    points: { issued: Number(issued?.s ?? 0), used: Math.abs(Number(used?.s ?? 0)) },
  });
});

/** 用户列表，附积分余额（实时从流水求和，不读冗余列） */
router.get("/admin/users", async (c) => {
  requireAdmin(c);
  const { page, size, limit, offset } = pageArgs(c.req.query("page"), c.req.query("size"));
  const keyword = (c.req.query("keyword") ?? "").trim();

  // D1 的 LIKE 对大小写不敏感仅限 ASCII，所以用 LOWER 显式统一
  const where = keyword ? "WHERE LOWER(nickname) LIKE ? OR phone LIKE ? OR LOWER(email) LIKE ?" : "";
  const kw = `%${keyword.toLowerCase()}%`;
  const binds = keyword ? [kw, `%${keyword}%`, kw] : [];

  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users ${where}`)
    .bind(...binds)
    .first<{ n: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.nickname, u.phone, u.email, u.plan_code, u.plan_expires_at, u.created_at,
            (SELECT COALESCE(SUM(delta), 0) FROM quota_logs q WHERE q.user_id = u.id) AS points_balance
     FROM users u ${where}
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
  )
    .bind(...binds, limit, offset)
    .all<{
      id: string;
      nickname: string | null;
      phone: string | null;
      email: string | null;
      plan_code: string;
      plan_expires_at: string | null;
      created_at: string;
      points_balance: number;
    }>();

  return c.json({
    total: Number(totalRow?.n ?? 0),
    page,
    size,
    items: (results ?? []).map((u) => ({
      id: u.id,
      nickname: u.nickname,
      phone: maskPhone(u.phone),
      email: maskEmail(u.email),
      plan_code: u.plan_code,
      plan_expires_at: u.plan_expires_at,
      points_balance: Number(u.points_balance ?? 0),
      created_at: u.created_at,
    })),
  });
});

/** 订单列表，带下单用户信息（联系方式打码） */
router.get("/admin/orders", async (c) => {
  requireAdmin(c);
  const { page, size, limit, offset } = pageArgs(c.req.query("page"), c.req.query("size"));
  const status = (c.req.query("status") ?? "").trim();

  const where = status ? "WHERE o.status = ?" : "";
  const binds = status ? [status] : [];

  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM orders o ${where}`)
    .bind(...binds)
    .first<{ n: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.plan_code, o.amount_cents, o.period_months, o.status,
            o.created_at, o.paid_at,
            u.nickname AS user_nickname, u.phone AS user_phone, u.email AS user_email
     FROM orders o LEFT JOIN users u ON u.id = o.user_id
     ${where}
     ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
  )
    .bind(...binds, limit, offset)
    .all<{
      id: string;
      plan_code: string;
      amount_cents: number;
      period_months: number;
      status: string;
      created_at: string;
      paid_at: string | null;
      user_nickname: string | null;
      user_phone: string | null;
      user_email: string | null;
    }>();

  return c.json({
    total: Number(totalRow?.n ?? 0),
    page,
    size,
    items: (results ?? []).map((o) => ({
      id: o.id,
      plan_code: o.plan_code,
      amount_cents: Number(o.amount_cents),
      period_months: Number(o.period_months),
      status: o.status,
      user_nickname: o.user_nickname,
      user_phone: maskPhone(o.user_phone),
      user_email: maskEmail(o.user_email),
      created_at: o.created_at,
      paid_at: o.paid_at,
    })),
  });
});

/** 积分流水查询：按动作类型或用户过滤 */
router.get("/admin/points", async (c) => {
  requireAdmin(c);
  const { page, size, limit, offset } = pageArgs(c.req.query("page"), c.req.query("size"), 30);
  const action = (c.req.query("action") ?? "").trim();
  const userId = (c.req.query("user_id") ?? "").trim();

  const conds: string[] = [];
  const binds: unknown[] = [];
  if (action) {
    conds.push("q.action = ?");
    binds.push(action);
  }
  if (userId) {
    conds.push("q.user_id = ?");
    binds.push(userId);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

  const [totalRow, actionsRow] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM quota_logs q ${where}`)
      .bind(...binds)
      .first<{ n: number }>(),
    // 供前端做筛选下拉：只列出实际出现过的动作，避免给一堆空选项
    c.env.DB.prepare("SELECT DISTINCT action FROM quota_logs ORDER BY action").all<{
      action: string;
    }>(),
  ]);

  const { results } = await c.env.DB.prepare(
    `SELECT q.id, q.user_id, q.action, q.delta, q.reason, q.created_at,
            u.nickname AS user_nickname, u.phone AS user_phone, u.email AS user_email
     FROM quota_logs q LEFT JOIN users u ON u.id = q.user_id
     ${where}
     ORDER BY q.created_at DESC LIMIT ? OFFSET ?`
  )
    .bind(...binds, limit, offset)
    .all<{
      id: string;
      user_id: string;
      action: string;
      delta: number;
      reason: string | null;
      created_at: string;
      user_nickname: string | null;
      user_phone: string | null;
      user_email: string | null;
    }>();

  return c.json({
    total: Number(totalRow?.n ?? 0),
    page,
    size,
    actions: (actionsRow.results ?? []).map((a) => a.action),
    items: (results ?? []).map((l) => ({
      id: l.id,
      user_id: l.user_id,
      user_nickname: l.user_nickname,
      user_phone: maskPhone(l.user_phone),
      user_email: maskEmail(l.user_email),
      action: l.action,
      delta: Number(l.delta),
      reason: l.reason,
      created_at: l.created_at,
    })),
  });
});

/**
 * 会计合作方列表，附归因统计。
 *
 * 三个口径都从 referrals 出发：
 *   signups     注册数
 *   paid_users  至少付过一次的用户数（不是订单数，避免把续费算成拉新）
 *   paid_orders 已支付订单数
 *   revenue_cents 已支付金额合计。同一个部署只有一种币种，不在这里换算。
 */
router.get("/admin/partners", async (c) => {
  requireAdmin(c);
  const { results } = await c.env.DB.prepare(
    `SELECT p.code, p.name, p.contact, p.note, p.status, p.created_at,
            (SELECT COUNT(*) FROM referrals r WHERE r.partner_code = p.code) AS signups,
            (SELECT COUNT(DISTINCT o.user_id)
               FROM referrals r JOIN orders o ON o.user_id = r.user_id
              WHERE r.partner_code = p.code AND o.status = 'paid') AS paid_users,
            (SELECT COUNT(*)
               FROM referrals r JOIN orders o ON o.user_id = r.user_id
              WHERE r.partner_code = p.code AND o.status = 'paid') AS paid_orders,
            (SELECT COALESCE(SUM(o.amount_cents), 0)
               FROM referrals r JOIN orders o ON o.user_id = r.user_id
              WHERE r.partner_code = p.code AND o.status = 'paid') AS revenue_cents
     FROM partners p
     ORDER BY p.created_at DESC`
  ).all<{
    code: string;
    name: string;
    contact: string | null;
    note: string | null;
    status: string;
    created_at: string;
    signups: number;
    paid_users: number;
    paid_orders: number;
    revenue_cents: number;
  }>();

  const items = (results ?? []).map((p) => ({
    code: p.code,
    name: p.name,
    contact: p.contact,
    note: p.note,
    status: p.status,
    created_at: p.created_at,
    signups: Number(p.signups ?? 0),
    paid_users: Number(p.paid_users ?? 0),
    paid_orders: Number(p.paid_orders ?? 0),
    revenue_cents: Number(p.revenue_cents ?? 0),
  }));

  return c.json({ total: items.length, items });
});

/**
 * 渠道来源统计。
 *
 * 一行对应一个 source + medium 组合。signups 用 DISTINCT 用户数，
 * 付费口径与会计合作保持一致：付费用户不重复计数，订单与金额按实际笔数累加。
 */
router.get("/admin/channels", async (c) => {
  requireAdmin(c);
  const { results } = await c.env.DB.prepare(
    `SELECT s.source, s.medium,
            COUNT(DISTINCT s.user_id) AS signups,
            COUNT(DISTINCT CASE WHEN o.status = 'paid' THEN o.user_id END) AS paid_users,
            COALESCE(SUM(CASE WHEN o.status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_orders,
            COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.amount_cents ELSE 0 END), 0) AS revenue_cents
     FROM signup_sources s
     LEFT JOIN orders o ON o.user_id = s.user_id
     GROUP BY s.source, s.medium
     ORDER BY signups DESC, s.source ASC`
  ).all<{
    source: string;
    medium: string | null;
    signups: number;
    paid_users: number;
    paid_orders: number;
    revenue_cents: number;
  }>();

  const items = (results ?? []).map((r) => ({
    source: r.source,
    medium: r.medium,
    signups: Number(r.signups ?? 0),
    paid_users: Number(r.paid_users ?? 0),
    paid_orders: Number(r.paid_orders ?? 0),
    revenue_cents: Number(r.revenue_cents ?? 0),
  }));

  return c.json({ total: items.reduce((n, r) => n + r.signups, 0), items });
});

/** 新建合作方。码由服务端生成，避免两位会计自己选到同一个码 */
router.post("/admin/partners", async (c) => {
  requireAdmin(c);
  const body = await c.req.json<any>().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 60);
  const contact = String(body?.contact ?? "").trim().slice(0, 120) || null;
  const note = String(body?.note ?? "").trim().slice(0, 200) || null;
  if (!name) throw badRequest("合作方名称不能为空");

  const ts = nowIso();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generatePartnerCode();
    const existing = await c.env.DB.prepare("SELECT code FROM partners WHERE code = ?")
      .bind(code)
      .first<{ code: string }>();
    if (existing) continue;

    try {
      await c.env.DB.prepare(
        `INSERT INTO partners (code, name, contact, note, status, created_at)
         VALUES (?, ?, ?, ?, 'active', ?)`
      )
        .bind(code, name, contact, note, ts)
        .run();
    } catch (e) {
      // 唯一键冲突说明两次生成撞上了，换一个再试
      console.warn("[admin] 创建合作方失败，重试:", code, e);
      continue;
    }

    return c.json(
      {
        code,
        name,
        contact,
        note,
        status: "active",
        created_at: ts,
        signups: 0,
        paid_users: 0,
        paid_orders: 0,
        revenue_cents: 0,
      },
      201
    );
  }

  throw serverError("生成推荐码失败，请重试");
});

/**
 * 微信凭证诊断。
 *
 * 用一个假 code 调 jscode2session，看返回的 errcode 判断配置状态：
 *   40029（code 无效）  → 凭证正确，链路通
 *   40013（appid 无效） → WX_APPID 配错了
 *   40125（secret 无效）→ WX_SECRET 配错了
 *
 * 只对国内版有意义：海外版不提供微信登录，这个接口返回 404。
 */
router.get("/admin/diagnostics/wechat", async (c) => {
  requireAdmin(c);
  if (isIntlDeployment(c.env)) throw notFound(WECHAT_DISABLED_MESSAGE);

  const appid = c.env.WX_APPID;
  const secret = c.env.WX_SECRET;
  if (!appid || !secret) {
    return c.json({
      ok: false,
      reason: "WX_APPID 或 WX_SECRET 未配置",
      hint: "用 wrangler secret put 配置这两个值",
    });
  }

  try {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=admin_diagnostic&grant_type=authorization_code`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as { errcode?: number; errmsg?: string };

    const reachable = body.errcode === 40029;
    return c.json({
      ok: reachable,
      http_status: res.status,
      errcode: body.errcode ?? null,
      errmsg: body.errmsg ?? null,
      verdict: reachable
        ? "凭证正确，微信接口可达"
        : body.errcode === 40013
          ? "WX_APPID 无效"
          : body.errcode === 40125
            ? "WX_SECRET 无效"
            : "未能确认，请结合 errmsg 判断",
    });
  } catch (e) {
    return c.json({
      ok: false,
      reason: e instanceof Error ? e.message : "请求微信接口失败",
      hint: "检查 Worker 是否能访问外网（正常情况下可以）",
    });
  }
});

function todayStartUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export default router;
