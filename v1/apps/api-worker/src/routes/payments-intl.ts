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
import { ApiError, badRequest, notFound, serverError } from "../lib/http";
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
  PaypalCaptureError,
  paypalCaptureOrder,
  paypalCreateOrder,
  paypalRetrieveCaptures,
  paypalVerifyWebhook,
  stripeCreateCheckout,
  stripeRetrieveSession,
  verifyStripeSignature,
} from "../lib/intl-payments";
import { dodoCreateCheckout, dodoKeyMatchesEnv } from "../lib/dodo-payments";

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

/**
 * 套餐对应的 Dodo 产品 ID。
 *
 * Dodo 的价格挂在产品上，所以一个套餐建一个产品。没配就返回空，
 * 由调用方报「未配置」——不能拿 Pro 的产品去卖 Enterprise。
 */
function dodoProductId(env: Env, planCode: string): string {
  if (planCode === "pro") return env.DODO_PRO_PRODUCT_ID ?? "";
  if (planCode === "enterprise") return env.DODO_ENT_PRODUCT_ID ?? "";
  return "";
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
    // Dodo 是 MoR，税费由它代收。开通条件是密钥和 Pro 产品 ID 都在，
    // 且密钥前缀与 DODO_ENV 对得上——测试密钥挂到线上等于免费送套餐
    dodo: dodoKeyMatchesEnv(c.env.DODO_API_KEY, c.env.DODO_ENV) && Boolean(c.env.DODO_PRO_PRODUCT_ID),
    dodo_live: c.env.DODO_ENV === "live",
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
  if (provider !== "stripe" && provider !== "paypal" && provider !== "dodo") {
    throw badRequest("provider 只能是 stripe、paypal 或 dodo");
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

    if (provider === "paypal") {
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
    }

    // ── Dodo Payments ──
    // 价格配在 Dodo 后台，这里只传产品 ID。套餐缺产品 ID 就说明还没建，
    // 直接报未配置，不要建出一个永远付不了的订单
    const dodoKey = c.env.DODO_API_KEY;
    if (!dodoKey) throw serverError("Dodo 未配置");
    if (!dodoKeyMatchesEnv(dodoKey, c.env.DODO_ENV)) {
      throw serverError("Dodo 密钥与运行环境不匹配，请检查 DODO_ENV");
    }
    const productId = dodoProductId(c.env, planCode);
    if (!productId) throw serverError("Dodo 未配置该套餐的产品");

    const { sessionId, checkoutUrl, paymentId } = await dodoCreateCheckout({
      apiKey: dodoKey,
      env: c.env.DODO_ENV,
      productId,
      orderId,
      returnUrl: `${root}/member?dodo=1&order=${orderId}`,
      customerEmail: user.email ?? undefined,
    });

    // 记 payment_id：webhook 和回跳核对都按它查单。
    // 万一建单时还没生成 payment，先存 session_id，webhook 到达时会覆盖成 payment_id
    await c.env.DB.prepare("UPDATE orders SET transaction_id = ? WHERE id = ?")
      .bind(paymentId ?? sessionId, orderId)
      .run();

    return c.json({
      order_id: orderId,
      provider,
      url: checkoutUrl,
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

  let result: Awaited<ReturnType<typeof paypalCaptureOrder>>;
  try {
    result = await paypalCaptureOrder({
      clientId,
      clientSecret,
      env: c.env.PAYPAL_ENV,
      paypalOrderId: order.transaction_id,
    });
  } catch (err) {
    if (!(err instanceof PaypalCaptureError)) throw err;
    console.error(`[paypal] 扣款失败 issue=${err.issue} order=${orderId}`);
    // 用户从 PayPal 点了「取消并返回」又退回支付页，订单仍未批准。
    // 这不是服务故障，返回 400 让前端照原样显示提示
    if (err.issue === "ORDER_NOT_APPROVED") {
      throw badRequest("支付尚未完成：请在 PayPal 页面完成付款后再返回");
    }
    if (err.issue !== "ORDER_ALREADY_CAPTURED") {
      throw new ApiError(409, `PayPal 扣款未完成（${err.issue}）`);
    }
    // 钱已经扣了，只是上一次请求没把结果写进订单。把扣款记录查回来补发货：
    // 只提示「刷新」的话，订单永远停在 pending，用户看到的就是付了钱没到账
    const recovered = await paypalRetrieveCaptures({
      clientId,
      clientSecret,
      env: c.env.PAYPAL_ENV,
      paypalOrderId: order.transaction_id,
    });
    if (!recovered) {
      throw new ApiError(409, "这笔支付已经扣款，刷新页面即可查看结果");
    }
    result = recovered;
  }

  if (result.currency !== order.currency || result.amountCents !== order.amount_cents) {
    console.error(
      `[paypal] 金额不一致 订单=${order.amount_cents}${order.currency} 实付=${result.amountCents}${result.currency} id=${orderId}`
    );
    throw badRequest("支付金额与订单不一致，请联系客服");
  }

  await fulfillOrder(c.env.DB, order as PayableOrder, result.captureId);
  return c.json({ paid: true });
});

/**
 * PayPal 回调。
 *
 * 回跳 capture 只覆盖「用户自己走回来」的情况。用户付完款关掉标签页时，
 * PayPal 那边已经是 APPROVED，我们这边还停在 pending：钱扣了，套餐没到。
 * 这个端点负责把那种订单补齐，定时对账是它的第二道保险。
 *
 * 事件只订阅 `PAYMENT.CAPTURE.COMPLETED`：退款和争议在 PayPal 后台人工处理，
 * 自动降级账号比晚降级更伤用户。
 */
router.post("/payments/paypal/webhook", async (c) => {
  const clientId = c.env.PAYPAL_CLIENT_ID;
  const clientSecret = c.env.PAYPAL_CLIENT_SECRET;
  const webhookId = c.env.PAYPAL_WEBHOOK_ID;
  // 缺配置时返回 503 而不是 200，让 PayPal 重试，别在无法验签的情况下发货
  if (!clientId || !clientSecret || !webhookId) {
    return c.json({ error: "PayPal webhook 未配置" }, 503);
  }

  let event: PaypalWebhookEvent;
  try {
    event = (await c.req.json()) as PaypalWebhookEvent;
  } catch {
    return c.json({ error: "回调体不是合法 JSON" }, 400);
  }

  const ok = await paypalVerifyWebhook({
    clientId,
    clientSecret,
    env: c.env.PAYPAL_ENV,
    webhookId,
    authAlgo: c.req.header("paypal-auth-algo") ?? "",
    certId: c.req.header("paypal-cert-id") ?? "",
    transmissionId: c.req.header("paypal-transmission-id") ?? "",
    transmissionSig: c.req.header("paypal-transmission-sig") ?? "",
    transmissionTime: c.req.header("paypal-transmission-time") ?? "",
    event,
  });
  if (!ok) return c.json({ error: "签名校验失败" }, 401);

  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return c.json({ received: true });
  }

  const captureId = event.resource?.id;
  const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
  if (!captureId) return c.json({ received: true });

  // 下单时把本地订单号写进了 purchase_units.custom_id，它最直接。
  // 老订单没有这个字段时退回按 PayPal 订单号或扣款号反查
  const order =
    (event.resource?.custom_id ? await loadOrder(c.env, event.resource.custom_id) : null) ??
    (paypalOrderId ? await findOrderByTransaction(c.env, paypalOrderId) : null) ??
    (await findOrderByTransaction(c.env, captureId));

  if (!order) {
    console.error(`[paypal] 回调找不到订单 capture=${captureId} paypal=${paypalOrderId ?? ""}`);
    return c.json({ received: true });
  }

  // 金额只记日志不拦截，理由同 Dodo：含税价可能高于本地净价
  const paidCents = Math.round(Number(event.resource?.amount?.value ?? 0) * 100);
  if (paidCents && paidCents !== order.amount_cents) {
    console.warn(
      `[paypal] 金额差异 订单=${order.amount_cents} 实收=${paidCents} ${event.resource?.amount?.currency_code ?? ""} order=${order.id}`
    );
  }

  await fulfillOrder(c.env.DB, order as PayableOrder, captureId);
  return c.json({ received: true });
});

/** 按 PayPal 订单号或扣款号反查本地订单，回调里拿不到 custom_id 时用 */
async function findOrderByTransaction(env: Env, transactionId: string): Promise<OrderRow | null> {
  return env.DB.prepare("SELECT * FROM orders WHERE transaction_id = ? AND provider = 'paypal'")
    .bind(transactionId)
    .first<OrderRow>();
}

interface PaypalWebhookEvent {
  event_type?: string;
  resource?: {
    id?: string;
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}

export default router;
