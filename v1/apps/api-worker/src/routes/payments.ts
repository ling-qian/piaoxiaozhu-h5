/**
 * 微信支付：下单、订单查询、回调。
 *
 * 三条底线（都是从「钱」的角度必须守住的）：
 *   1. **回调必须验签 + 验时间戳**，否则任何人 POST 一个「支付成功」就能白拿会员
 *   2. **回调必须幂等**，微信会重推，重复处理会导致重复发放积分
 *   3. **金额以服务端计算为准**，绝不接受客户端传来的金额
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import {
  ApiError,
  badRequest,
  forbidden,
  isUuid,
  notFound,
  serverError,
} from "../lib/http";
import { logPoints } from "../lib/points";
import {
  getPlan,
  isPointPackage,
  periodPoints,
  periodPriceCents,
  PLANS,
  POINT_PACKAGES,
  renewalExpiry,
  UNLIMITED,
} from "../lib/plans";
import { nowIso } from "../lib/time";
import {
  buildPayParams,
  createJsapiPrepay,
  decryptResource,
  verifyNotify,
  WeChatPayError,
  type EncryptedResource,
} from "../lib/wechat-pay";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

const ALLOWED_PERIODS = [1, 3, 12];
/** out_trade_no 前缀，便于在微信侧区分业务线 */
const TRADE_NO_PREFIX = "PX";

interface PayConfig {
  appid: string;
  mchid: string;
  serialNo: string;
  privateKeyPem: string;
  apiv3Key: string;
  platformPublicKey: string;
  notifyUrl: string;
}

/** 支付能否真正收款：五个凭据缺一不可 */
function payConfig(env: Env): PayConfig {
  const appid = env.WX_APPID;
  const mchid = env.WX_MCH_ID;
  const serialNo = env.WX_CERT_SERIAL_NO;
  const privateKeyPem = env.WX_PRIVATE_KEY_PEM;
  const apiv3Key = env.WX_API_KEY;
  const platformPublicKey = env.WX_PLATFORM_PUBLIC_KEY;
  const notifyUrl = env.WX_NOTIFY_URL;

  const missing = [
    ["WX_APPID", appid],
    ["WX_MCH_ID", mchid],
    ["WX_CERT_SERIAL_NO", serialNo],
    ["WX_PRIVATE_KEY_PEM", privateKeyPem],
    ["WX_API_KEY", apiv3Key],
    ["WX_PLATFORM_PUBLIC_KEY", platformPublicKey],
    ["WX_NOTIFY_URL", notifyUrl],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new ApiError(503, `支付未配置完整，缺少：${missing.join("、")}`);
  }

  return {
    appid: appid!,
    mchid: mchid!,
    serialNo: serialNo!,
    privateKeyPem: privateKeyPem!,
    apiv3Key: apiv3Key!,
    platformPublicKey: platformPublicKey!,
    notifyUrl: notifyUrl!,
  };
}

/** 生成商户订单号：PX + 时间戳 + 随机，长度不超过微信 32 位上限 */
function newTradeNo(): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return `${TRADE_NO_PREFIX}${Date.now()}${rand}`.slice(0, 32);
}

router.post("/payments/wechat/prepay", async (c) => {
  const u = c.get("user");
  const body = await c.req.json<any>().catch(() => ({}));
  const planCode = String(body?.plan_code ?? "").trim();
  if (!planCode) throw badRequest("plan_code is required");

  const monthsRaw = body?.period_months ?? 1;
  const periodMonths = Number(monthsRaw);
  if (!Number.isInteger(periodMonths)) throw badRequest("period_months 必须是整数");

  // 金额一律服务端算：客户端传什么价都不认
  let amountCents: number;
  let description: string;
  let kind: "plan" | "points";

  if (isPointPackage(planCode)) {
    const pkg = POINT_PACKAGES[planCode]!;
    amountCents = pkg.priceCents;
    description = `票小助积分包 ${pkg.name}`;
    kind = "points";
  } else {
    const plan = PLANS[planCode];
    if (!plan || !plan.priceCents) {
      // 未知套餐、或免费版（价格 0）都不该走到支付
      throw notFound("Plan not found");
    }
    if (!ALLOWED_PERIODS.includes(periodMonths)) {
      throw badRequest("period_months 只支持 1 / 3 / 12（包月 / 包季 / 包年）");
    }
    amountCents = periodPriceCents(plan, periodMonths);
    description = `票小助 ${plan.name} ${periodMonths} 个月`;
    kind = "plan";
  }

  if (amountCents <= 0) throw serverError("金额计算异常，已中止下单");

  const cfg = payConfig(c.env);
  const orderId = crypto.randomUUID();
  const tradeNo = newTradeNo();
  const ts = nowIso();

  // 先落 pending 订单再下单：微信那边成功了但我们没记录，就会变成「付了钱没开通」
  await c.env.DB.prepare(
    `INSERT INTO orders (id, user_id, plan_code, amount_cents, transaction_id, status, paid_at, created_at, period_months)
     VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`
  )
    .bind(orderId, u.id, planCode, amountCents, tradeNo, ts, kind === "points" ? 1 : periodMonths)
    .run();

  let prepayId: string;
  try {
    prepayId = await createJsapiPrepay({
      appid: cfg.appid,
      mchid: cfg.mchid,
      serialNo: cfg.serialNo,
      privateKeyPem: cfg.privateKeyPem,
      notifyUrl: cfg.notifyUrl,
      description,
      outTradeNo: tradeNo,
      amountCents,
      openid: u.openid,
    });
  } catch (e) {
    // 下单失败要把 pending 订单标掉，避免留下一堆死单干扰对账
    await c.env.DB.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").bind(orderId).run();
    throw serverError(e instanceof WeChatPayError ? `下单失败：${e.message}` : "下单失败");
  }

  const payParams = await buildPayParams({
    appid: cfg.appid,
    prepayId,
    privateKeyPem: cfg.privateKeyPem,
  });

  return c.json({
    order_id: orderId,
    out_trade_no: tradeNo,
    plan_code: planCode,
    period_months: kind === "points" ? 1 : periodMonths,
    amount_cents: amountCents,
    /** 直接喂给 wx.requestPayment */
    pay_params: payParams,
  });
});

router.get("/orders/:id", async (c) => {
  const u = c.get("user");
  const orderId = c.req.param("id");
  if (!isUuid(orderId)) throw notFound("订单不存在");

  const row = await c.env.DB.prepare(
    `SELECT id, plan_code, amount_cents, status, paid_at, period_months, transaction_id
     FROM orders WHERE id = ? AND user_id = ?`
  )
    .bind(orderId, u.id)
    .first<{
      id: string;
      plan_code: string;
      amount_cents: number;
      status: string;
      paid_at: string | null;
      period_months: number;
      transaction_id: string | null;
    }>();
  if (!row) throw notFound("订单不存在");

  // 支付完成与否以本接口为准：wx.requestPayment 的 success 只代表「前端调通」，
  // 真正的到账要等回调
  return c.json({
    id: row.id,
    status: row.status,
    plan_code: row.plan_code,
    amount_cents: row.amount_cents,
    period_months: row.period_months,
    paid_at: row.paid_at,
    transaction_id: row.transaction_id,
  });
});

/**
 * 支付回调。
 *
 * 注意：这个路由在鉴权中间件之外（微信服务器不带我们的 JWT），
 * 所以安全边界完全由「验签 + 解密」承担。
 */
router.post("/payments/wechat/notify", async (c) => {
  const rawBody = await c.req.text();
  const cfg = payConfig(c.env);

  // 1) 验签：失败直接 401，且不做任何业务处理
  try {
    await verifyNotify(c.req.raw.headers, rawBody, cfg.platformPublicKey);
  } catch (e) {
    console.error("[pay] 回调验签失败:", e instanceof Error ? e.message : e);
    return c.json({ code: "FAIL", message: "验签失败" }, 401);
  }

  // 2) 解密 resource
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as { resource?: EncryptedResource };
    if (!parsed.resource) throw new Error("缺少 resource");
    payload = await decryptResource(parsed.resource, cfg.apiv3Key);
  } catch (e) {
    console.error("[pay] 回调解密失败:", e instanceof Error ? e.message : e);
    return c.json({ code: "FAIL", message: "解密失败" }, 400);
  }

  const tradeState = String(payload.trade_state ?? "");
  const outTradeNo = String(payload.out_trade_no ?? "");
  const transactionId = String(payload.transaction_id ?? "");
  const total = Number((payload.amount as { total?: number } | undefined)?.total ?? 0);

  // 非成功状态只记录，不改订单（微信也会推 PAYERROR 等）
  if (tradeState !== "SUCCESS") {
    console.log(`[pay] 非成功状态 ${tradeState}，忽略: ${outTradeNo}`);
    return c.json({ code: "SUCCESS", message: "已接收" });
  }

  const order = await c.env.DB.prepare(
    `SELECT id, user_id, plan_code, amount_cents, status, period_months
     FROM orders WHERE transaction_id = ?`
  )
    .bind(outTradeNo)
    .first<{
      id: string;
      user_id: string;
      plan_code: string;
      amount_cents: number;
      status: string;
      period_months: number;
    }>();

  if (!order) {
    // 找不到订单也要回成功，否则微信会一直重推；但日志要留证据
    console.error(`[pay] 回调找不到订单: ${outTradeNo}`);
    return c.json({ code: "SUCCESS", message: "订单不存在，已忽略" });
  }

  // 3) 幂等：已处理过的回调直接返回成功
  if (order.status === "paid") {
    console.log(`[pay] 订单已处理，跳过: ${order.id}`);
    return c.json({ code: "SUCCESS", message: "已处理" });
  }

  // 4) 金额核对：与服务端下单金额不一致说明异常，不发货
  if (total !== order.amount_cents) {
    console.error(`[pay] 金额不一致 订单=${order.amount_cents} 回调=${total} 单号=${outTradeNo}`);
    return c.json({ code: "SUCCESS", message: "金额不一致，待人工核对" });
  }

  const ts = nowIso();

  // 5) 发货：订单置 paid → 发积分 → 更新套餐（积分包不改 plan_code）
  await c.env.DB.prepare(
    "UPDATE orders SET status = 'paid', paid_at = ?, transaction_id = ? WHERE id = ?"
  )
    .bind(ts, transactionId || outTradeNo, order.id)
    .run();

  if (isPointPackage(order.plan_code)) {
    const pkg = POINT_PACKAGES[order.plan_code]!;
    await logPoints(c.env.DB, order.user_id, "purchase_grant", pkg.points, `购买积分包 ${pkg.name}，订单 ${order.id}`, ts);
  } else {
    const plan = getPlan(order.plan_code);
    const grant = periodPoints(plan, order.period_months);
    if (grant > 0) {
      await logPoints(
        c.env.DB,
        order.user_id,
        "purchase_grant",
        grant,
        `购买套餐 ${order.plan_code}（${order.period_months} 个月），订单 ${order.id}`,
        ts
      );
    }

    const user = await c.env.DB.prepare("SELECT plan_expires_at FROM users WHERE id = ?")
      .bind(order.user_id)
      .first<{ plan_expires_at: string | null }>();
    const expiry = renewalExpiry(user?.plan_expires_at, order.period_months);

    await c.env.DB.prepare(
      "UPDATE users SET plan_code = ?, plan_expires_at = ?, plan_remind_stage = NULL WHERE id = ?"
    )
      .bind(order.plan_code, expiry, order.user_id)
      .run();
  }

  // 微信要求回这个结构，否则会重推
  return c.json({ code: "SUCCESS", message: "成功" });
});

/** 套餐与积分包价目表（前端会员页用，避免价格写死在两端） */
router.get("/plans", async (c) => {
  return c.json({
    plans: Object.values(PLANS).map((p) => ({
      code: p.code,
      name: p.name,
      desc: p.desc,
      price_cents: p.priceCents,
      project_limit: p.projectLimit === UNLIMITED ? -1 : p.projectLimit,
      invoice_limit: p.invoiceLimit === UNLIMITED ? -1 : p.invoiceLimit,
      can_export: p.canExport,
      features: p.features,
      points_grant: p.pointsGrant,
    })),
    periods: [
      { months: 1, label: "1 个月", discount: 1.0 },
      { months: 3, label: "3 个月", discount: 0.9 },
      { months: 12, label: "12 个月", discount: 0.8 },
    ],
    point_packages: Object.values(POINT_PACKAGES),
    payment_enabled: Boolean(
      c.env.WX_MCH_ID && c.env.WX_PRIVATE_KEY_PEM && c.env.WX_PLATFORM_PUBLIC_KEY && c.env.WX_API_KEY
    ),
  });
});

export default router;
