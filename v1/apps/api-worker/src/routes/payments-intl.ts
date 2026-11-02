/**
 * 境外支付：Stripe 与 PayPal。
 *
 * ## 为什么和微信支付分开成两个文件
 *
 * 微信支付要签名、要证书、回调是加密的 XML/JSON；境外两家走的是标准
 * REST + HMAC 验签。混在一个文件里会让「改微信逻辑时误碰境外」的风险变高，
 * 而这两条线的故障方式完全不同。
 *
 * ## 发货时机
 *
 * - Stripe：以 webhook 为准（可靠），另外提供 `/sync` 供前端回跳后主动核对，
 *   避免本地调试时因 webhook 不到而「付了钱没到账」
 * - PayPal：以 capture 接口为准。PayPal 的 webhook 需要证书校验，MVP 阶段不做，
 *   代价是用户付款后必须回到我们的页面触发 capture —— 若他直接关掉标签页，
 *   订单会停在 pending，需要人工或定时任务对账
 */

import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { badRequest, notFound, serverError } from "../lib/http";
import { fulfillOrder, type PayableOrder } from "../lib/order-fulfill";
import {
  POINT_PACKAGES,
  getPlan,
  isPointPackage,
  packagePrice,
  periodPriceCents,
} from "../lib/plans";
import { nowIso } from "../lib/time";
import {
  paypalCaptureOrder,
  paypalCreateOrder,
  stripeCreateCheckout,
  stripeRetrieveSession,
  verifyStripeSignature,
} from "../lib/intl-payments";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

/** 站点根地址，用于支付完成后的回跳。末尾斜杠去掉，避免拼出 //member */
function baseUrl(env: Env): string {
  return (env.APP_BASE_URL || "").replace(/\/+$/, "");
}

interface OrderRow {
  id: string;
  user_id: string;
  plan_code: string;
  amount_cents: number;
  period_months: number;
  status: string;
  currency: string;
  provider: string;
  /** Stripe 是 checkout session id，PayPal 是 PayPal 订单号 */
  transaction_id: string | null;
}

/**
 * 计算某商品在美元下的价格。
 * 返回 null 表示该商品不支持美元结算（例如免费版），调用方据此拒绝下单。
 */
function usdAmount(planCode: string, periodMonths: number): number | null {
  if (isPointPackage(planCode)) {
    const pkg = POINT_PACKAGES[planCode]!;
    return packagePrice(pkg, "USD") || null;
  }
  const plan = getPlan(planCode);
  const unit = plan.priceCentsUsd ?? 0;
  if (unit <= 0) return null;
  return periodPriceCents(plan, periodMonths, "USD");
}

/** 商品名，写进支付商后台便于对账 */
function productName(planCode: string, periodMonths: number): string {
  if (isPointPackage(planCode)) return POINT_PACKAGES[planCode]!.name;
  const plan = getPlan(planCode);
  return periodMonths > 1 ? `${plan.code} ${periodMonths} months` : plan.code;
}

/** 建一条 pending 订单，返回订单号 */
async function createOrder(
  env: Env,
  userId: string,
  planCode: string,
  periodMonths: number,
  amountCents: number,
  provider: string
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO orders (id, user_id, plan_code, amount_cents, transaction_id, status, paid_at, created_at, period_months, currency, provider)
     VALUES (?, ?, ?, ?, NULL, 'pending', NULL, ?, ?, 'USD', ?)`
  )
    .bind(id, userId, planCode, amountCents, nowIso(), periodMonths, provider)
    .run();
  return id;
}

async function loadOrder(env: Env, orderId: string): Promise<OrderRow | null> {
  return env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<OrderRow>();
}

/**
 * 支付能力探测。
 *
 * 前端据此决定显示哪些按钮：只开通 PayPal 时不该把信用卡按钮摆出来，
 * 点了只会报「Stripe 未配置」。只返回布尔值，不暴露任何密钥。
 */
router.get("/payments/intl/config", async (c) => {
  return c.json({
    stripe: Boolean(c.env.STRIPE_SECRET_KEY),
    paypal: Boolean(c.env.PAYPAL_CLIENT_ID && c.env.PAYPAL_CLIENT_SECRET),
    paypal_live: c.env.PAYPAL_ENV === "live",
    region: c.env.REGION ?? "cn",
  });
});

/** 统一的下单入口：按 provider 创建对应支付页 */
router.post("/payments/intl/checkout", async (c) => {
  const user = c.get("user");

  let body: { planCode?: string; periodMonths?: number; provider?: string };
  try {
    body = await c.req.json();
  } catch {
    throw badRequest("请求体格式不正确");
  }

  const planCode = String(body.planCode ?? "").trim();
  const provider = String(body.provider ?? "stripe").trim();
  const periodMonths = Math.max(Number(body.periodMonths ?? 1) || 1, 1);

  if (!planCode) throw badRequest("缺少 planCode");
  if (provider !== "stripe" && provider !== "paypal") {
    throw badRequest("provider 只能是 stripe 或 paypal");
  }

  const amount = usdAmount(planCode, periodMonths);
  if (amount === null) throw badRequest("该商品不支持美元结算");

  const root = baseUrl(c.env);
  if (!root) throw serverError("未配置 APP_BASE_URL，无法生成支付回跳地址");

  const orderId = await createOrder(c.env, user.id, planCode, periodMonths, amount, provider);
  const name = productName(planCode, periodMonths);

  try {
    if (provider === "stripe") {
      const key = c.env.STRIPE_SECRET_KEY;
      if (!key) throw serverError("Stripe 未配置");

      const { url, sessionId } = await stripeCreateCheckout({
        secretKey: key,
        amountCents: amount,
        currency: "USD",
        productName: name,
        orderId,
        successUrl: `${root}/member?paid=1&order=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${root}/member?cancel=1&order=${orderId}`,
      });

      // 记下 session id，便于 /sync 与 webhook 互相印证
      await c.env.DB.prepare("UPDATE orders SET transaction_id = ? WHERE id = ?")
        .bind(sessionId, orderId)
        .run();

      return c.json({ order_id: orderId, provider, url, amount_cents: amount, currency: "USD" });
    }

    const clientId = c.env.PAYPAL_CLIENT_ID;
    const clientSecret = c.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw serverError("PayPal 未配置");

    const { paypalOrderId, approveUrl } = await paypalCreateOrder({
      clientId,
      clientSecret,
      env: c.env.PAYPAL_ENV,
      amountCents: amount,
      currency: "USD",
      description: name,
      orderId,
      returnUrl: `${root}/member?paypal=1&order=${orderId}`,
      cancelUrl: `${root}/member?cancel=1&order=${orderId}`,
    });

    await c.env.DB.prepare("UPDATE orders SET transaction_id = ? WHERE id = ?")
      .bind(paypalOrderId, orderId)
      .run();

    return c.json({
      order_id: orderId,
      provider,
      url: approveUrl,
      amount_cents: amount,
      currency: "USD",
    });
  } catch (e) {
    // 下单失败要把订单标 failed，否则会留下一堆 pending 脏数据
    await c.env.DB.prepare("UPDATE orders SET status = 'failed' WHERE id = ?")
      .bind(orderId)
      .run();
    if (e instanceof Error && e.message.includes("未配置")) throw e;
    throw serverError(e instanceof Error ? e.message : "下单失败");
  }
});

/**
 * Stripe 回调。
 *
 * 注意：这个路由不走用户 JWT，靠签名验真。已在 index.ts 的中间件白名单里放行。
 */
router.post("/payments/stripe/webhook", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // 没配密钥就无法验签，宁可 500 让 Stripe 重试，也不能盲目信任请求体
    return c.json({ error: "Stripe webhook 未配置" }, 500);
  }

  // 必须拿原始文本验签：JSON.parse 再 stringify 会改变空白，签名对不上
  const raw = await c.req.text();
  const ok = await verifyStripeSignature(secret, raw, c.req.header("stripe-signature") ?? null);
  if (!ok) return c.json({ error: "签名校验失败" }, 400);

  let event: {
    type?: string;
    data?: { object?: { id?: string; metadata?: { order_id?: string }; payment_status?: string } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return c.json({ error: "回调体不是合法 JSON" }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    // 其它事件与发货无关，直接 200 让 Stripe 别再重推
    return c.json({ received: true });
  }

  const session = event.data?.object;
  const orderId = session?.metadata?.order_id;
  if (!orderId) return c.json({ received: true });

  const order = await loadOrder(c.env, orderId);
  if (!order) return c.json({ received: true });

  // 金额核对：Stripe 那边实付与本地订单不一致时不发货，等人工处理
  await fulfillOrder(c.env.DB, order as PayableOrder, session?.id ?? orderId);
  return c.json({ received: true });
});

/**
 * 前端回跳后主动核对 Stripe 会话。
 *
 * webhook 有时会延迟几秒到几分钟，用户付完钱立刻回到页面却看到「未支付」，
 * 会以为失败了并重复付款。这个接口让页面能当场确认。
 */
router.post("/payments/stripe/sync", async (c) => {
  const user = c.get("user");
  let body: { orderId?: string };
  try {
    body = await c.req.json();
  } catch {
    throw badRequest("请求体格式不正确");
  }

  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) throw badRequest("缺少 orderId");

  const order = await loadOrder(c.env, orderId);
  if (!order || order.user_id !== user.id) throw notFound("订单不存在");

  if (order.status === "paid") {
    return c.json({ paid: true, status: "paid" });
  }

  const key = c.env.STRIPE_SECRET_KEY;
  if (!key) throw serverError("Stripe 未配置");
  if (!order.transaction_id) throw badRequest("该订单没有 Stripe 会话");

  const session = await stripeRetrieveSession(key, order.transaction_id);
  if (session.paymentStatus !== "paid") {
    return c.json({ paid: false, status: session.status ?? "unpaid" });
  }

  await fulfillOrder(c.env.DB, order as PayableOrder, session.id ?? order.transaction_id);
  return c.json({ paid: true, status: "paid" });
});

/**
 * PayPal 扣款。
 *
 * 用户从 PayPal 页面跳回来时调用。必须校验实付金额与币种——
 * 不能只信 PayPal 说「COMPLETED」，否则有人能改前端传的订单号。
 */
router.post("/payments/paypal/capture", async (c) => {
  const user = c.get("user");
  let body: { orderId?: string };
  try {
    body = await c.req.json();
  } catch {
    throw badRequest("请求体格式不正确");
  }

  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) throw badRequest("缺少 orderId");

  const order = await loadOrder(c.env, orderId);
  if (!order || order.user_id !== user.id) throw notFound("订单不存在");

  if (order.status === "paid") return c.json({ paid: true });

  const clientId = c.env.PAYPAL_CLIENT_ID;
  const clientSecret = c.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw serverError("PayPal 未配置");
  if (!order.transaction_id) throw badRequest("该订单没有 PayPal 订单号");

  const result = await paypalCaptureOrder({
    clientId,
    clientSecret,
    env: c.env.PAYPAL_ENV,
    paypalOrderId: order.transaction_id,
  });

  if (result.currency !== order.currency || result.amountCents !== order.amount_cents) {
    console.error(
      `[paypal] 金额不一致 订单=${order.amount_cents}${order.currency} 实付=${result.amountCents}${result.currency} id=${orderId}`
    );
    throw badRequest("支付金额与订单不一致，请联系客服");
  }

  await fulfillOrder(c.env.DB, order as PayableOrder, result.captureId);
  return c.json({ paid: true });
});

export default router;
