/**
 * PayPal 定时对账。
 *
 * 补的是「用户付完款没回到站点」那一类订单：PayPal 侧已经 APPROVED，
 * 本地还停在 pending，钱扣了但套餐没到。webhook 能覆盖大部分情况，
 * 但端点配错、网络抖动、用户关浏览器比回调还快，都会漏。
 * 对账不依赖任何外部配置，只要 Worker 在跑、PayPal 凭证有效，
 * 钱和套餐最终会对上。
 *
 * 只处理创建超过 10 分钟、24 小时以内的订单。太新的可能用户还在付款页，
 * 这时扣款会和他正在做的操作打架；太旧的 PayPal 订单早已过期，
 * 查了也只会得到 VOIDED。
 */

import type { Env } from "../env";
import { PaypalCaptureError, paypalCaptureOrder, paypalRetrieveCaptures } from "./intl-payments";
import { fulfillOrder, type PayableOrder } from "./order-fulfill";

interface PendingPaypalOrder extends PayableOrder {
  transaction_id: string | null;
  currency: string;
}

/**
 * 每轮最多处理 8 单。
 *
 * 每单要发 1 到 3 个外部请求，Cloudflare 对单次执行的 subrequest 数量
 * 有上限，批量开大只会让后面的订单直接失败。
 */
const BATCH = 8;

/** 创建多久之后才纳入对账，单位毫秒 */
const MIN_AGE_MS = 10 * 60 * 1000;
/** 超过这个时间不再查，PayPal 订单早已过期 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function reconcilePaypalOrders(
  env: Env
): Promise<{ scanned: number; paid: number; failed: number }> {
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { scanned: 0, paid: 0, failed: 0 };

  const now = Date.now();
  const newest = new Date(now - MIN_AGE_MS).toISOString();
  const oldest = new Date(now - MAX_AGE_MS).toISOString();

  const rows = await env.DB.prepare(
    `SELECT * FROM orders
      WHERE provider = 'paypal' AND status = 'pending'
        AND created_at <= ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?`
  )
    .bind(newest, oldest, BATCH)
    .all<PendingPaypalOrder>();

  const orders = rows.results ?? [];
  let paid = 0;
  let failed = 0;

  for (const order of orders) {
    if (!order.transaction_id) continue;
    try {
      const captured = await captureOrRecover(env, clientId, clientSecret, order.transaction_id);
      // null 表示用户还没在 PayPal 批准，下一轮再看
      if (!captured) continue;

      // 金额对不上就不发货。这里不抛错：对账是后台任务，
      // 抛出去只会让整批停在同一单上，记日志等人看更合适
      if (captured.currency !== order.currency || captured.amountCents !== order.amount_cents) {
        console.error(
          `[paypal-reconcile] 金额不一致 order=${order.id} 订单=${order.amount_cents}${order.currency} 实收=${captured.amountCents}${captured.currency}`
        );
        failed++;
        continue;
      }

      const { alreadyPaid } = await fulfillOrder(env.DB, order, captured.captureId);
      if (!alreadyPaid) paid++;
    } catch (err) {
      failed++;
      console.error(`[paypal-reconcile] 处理失败 order=${order.id}`, err);
    }
  }

  return { scanned: orders.length, paid, failed };
}

/**
 * 扣款，或者把之前的扣款结果捡回来。
 *
 * 三种结果分别对应三种情况：扣成功、已经扣过、还没批准。
 * 还没批准返回 null，不算失败。
 */
async function captureOrRecover(
  env: Env,
  clientId: string,
  clientSecret: string,
  paypalOrderId: string
): Promise<{ amountCents: number; currency: string; captureId: string } | null> {
  try {
    return await paypalCaptureOrder({
      clientId,
      clientSecret,
      env: env.PAYPAL_ENV,
      paypalOrderId,
    });
  } catch (err) {
    if (!(err instanceof PaypalCaptureError)) throw err;

    // 用户还停在付款页，或者订单已过期。下一轮或不再处理
    if (
      err.issue === "ORDER_NOT_APPROVED" ||
      err.issue === "ORDER_NOT_FOUND" ||
      err.issue === "INVALID_RESOURCE_ID" ||
      err.issue === "ORDER_EXPIRED"
    ) {
      return null;
    }

    // 之前某次 capture 已经扣过款，把结果查回来直接发货
    if (err.issue === "ORDER_ALREADY_CAPTURED") {
      return await paypalRetrieveCaptures({ clientId, clientSecret, env: env.PAYPAL_ENV, paypalOrderId });
    }

    throw err;
  }
}
