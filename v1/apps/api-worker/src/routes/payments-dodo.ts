/**
 * Dodo Payments 的回调与回跳核对。
 *
 * 下单入口在 `payments-intl.ts`（三个渠道共用一套订单表和金额计算），
 * 这里只放 Dodo 独有的两件事：接收 webhook、以及用户回跳后主动查一次状态。
 *
 * ## 发货以 webhook 为准
 *
 * PayPal 那条线只靠回跳 capture，用户关掉标签页就停在 pending。
 * Dodo 有 webhook，所以回跳只作补位：webhook 没到时页面能当场确认，
 * webhook 先到时页面这次调用直接返回已支付。
 */

import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { badRequest, notFound, serverError } from "../lib/http";
import { fulfillOrder, type PayableOrder } from "../lib/order-fulfill";
import { dodoKeyMatchesEnv, dodoRetrieveCheckout, dodoRetrievePayment, verifyDodoSignature } from "../lib/dodo-payments";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

interface OrderRow {
  id: string;
  user_id: string;
  plan_code: string;
  amount_cents: number;
  period_months: number;
  status: string;
  currency: string;
  provider: string;
  transaction_id: string | null;
}

async function loadOrder(env: Env, orderId: string): Promise<OrderRow | null> {
  return env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<OrderRow>();
}

/**
 * Dodo 回调。
 *
 * 走 Standard Webhooks 验签，不加用户 JWT。已在 index.ts 的白名单里放行。
 * 没配签名密钥时返回 503 而不是 200：宁可让 Dodo 重试，
 * 也不能在「无法确认真实性」的情况下发货。
 */
router.post("/payments/dodo/webhook", async (c) => {
  const secret = c.env.DODO_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: "Dodo webhook 未配置" }, 503);
  }

  // 必须拿原始文本验签。JSON.parse 再 stringify 会改变空白，签名对不上
  const raw = await c.req.text();
  const ok = await verifyDodoSignature({
    secret,
    rawBody: raw,
    webhookId: c.req.header("webhook-id") ?? null,
    webhookTimestamp: c.req.header("webhook-timestamp") ?? null,
    webhookSignature: c.req.header("webhook-signature") ?? null,
  });
  if (!ok) return c.json({ error: "签名校验失败" }, 401);

  let event: {
    type?: string;
    data?: {
      payload_type?: string;
      payment_id?: string;
      total_amount?: number;
      currency?: string;
      status?: string;
      metadata?: Record<string, string>;
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return c.json({ error: "回调体不是合法 JSON" }, 400);
  }

  // 只处理支付成功。退款、争议等事件由 Dodo 后台人工处理，
  // 我们这边不自动降级账号——误降级比晚降级更伤用户
  if (event.type !== "payment.succeeded") {
    return c.json({ received: true });
  }

  const data = event.data;
  const orderId = data?.metadata?.order_id;
  if (!orderId) return c.json({ received: true });

  const order = await loadOrder(c.env, orderId);
  if (!order) {
    console.error(`[dodo] 回调找不到订单 order=${orderId} payment=${data?.payment_id ?? ""}`);
    return c.json({ received: true });
  }

  // 金额只记日志不拦截：产品价格配在 Dodo 后台，用户无法改写；
  // 而含税价可能高于本地净价，用严格相等会误拒真实付款
  if (data?.total_amount !== undefined && data.total_amount !== order.amount_cents) {
    console.warn(
      `[dodo] 金额差异 订单=${order.amount_cents} 实收=${data.total_amount} ${data.currency ?? ""} order=${orderId}`
    );
  }

  if (data?.payment_id) {
    await c.env.DB.prepare("UPDATE orders SET transaction_id = ? WHERE id = ?")
      .bind(data.payment_id, orderId)
      .run();
  }

  await fulfillOrder(c.env.DB, order as PayableOrder, data?.payment_id ?? orderId);
  return c.json({ received: true });
});

/**
 * 用户从 Dodo 收银页跳回来时调用。
 *
 * 和 Stripe 的 /sync 同义：webhook 可能晚几秒，页面干等会让用户以为失败。
 */
router.post("/payments/dodo/sync", async (c) => {
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
  if (order.provider !== "dodo") throw badRequest("该订单不是 Dodo 支付");

  if (order.status === "paid") return c.json({ paid: true, status: "paid" });

  const apiKey = c.env.DODO_API_KEY;
  if (!apiKey) throw serverError("Dodo 未配置");
  if (!dodoKeyMatchesEnv(apiKey, c.env.DODO_ENV)) {
    throw serverError("Dodo 密钥与运行环境不匹配，请检查 DODO_ENV");
  }
  if (!order.transaction_id) {
    // 建单时既没拿到 payment_id 也没存 session_id，只能等 webhook
    return c.json({ paid: false, status: "pending" });
  }

  // 建单时通常没有 payment_id，存的是会话 ID。这里先按会话反查，
  // 拿到 payment_id 才能查金额。用前缀区分，避免两种 ID 混在一起
  const isSession = order.transaction_id.startsWith("cks_");
  let paymentId: string | null = isSession ? null : order.transaction_id;

  if (isSession) {
    const session = await dodoRetrieveCheckout({
      apiKey,
      env: c.env.DODO_ENV,
      sessionId: order.transaction_id,
    });
    if (session.paymentStatus !== "succeeded" || !session.paymentId) {
      return c.json({ paid: false, status: session.paymentStatus ?? "pending" });
    }
    paymentId = session.paymentId;

    // 把会话 ID 补成 payment_id，后续 webhook 和重复核对都省一次查询
    await c.env.DB.prepare("UPDATE orders SET transaction_id = ? WHERE id = ?")
      .bind(paymentId, orderId)
      .run();
  }

  if (!paymentId) return c.json({ paid: false, status: "pending" });

  const payment = await dodoRetrievePayment({
    apiKey,
    env: c.env.DODO_ENV,
    paymentId,
  });

  if (payment.status !== "succeeded") {
    return c.json({ paid: false, status: payment.status });
  }

  await fulfillOrder(c.env.DB, order as PayableOrder, payment.paymentId);
  return c.json({ paid: true, status: "paid" });
});

export default router;
