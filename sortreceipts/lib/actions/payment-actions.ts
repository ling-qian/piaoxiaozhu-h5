"use server";

/**
 * 境外支付的服务端动作。
 *
 * 前端拿到的是支付商页面的地址，然后整页跳转过去。不在前端做任何金额计算，
 * 也不把支付商密钥暴露到浏览器——所有敏感参数都在服务端拼好。
 */

import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@/lib/auth";

export type PayProvider = "stripe" | "paypal";

export interface CheckoutResult {
  orderId: string;
  provider: PayProvider;
  /** 支付商托管的收银页地址，直接 window.location.href 过去 */
  url: string;
  amountCents: number;
  currency: string;
}

export interface IntlPaymentConfig {
  stripe: boolean;
  paypal: boolean;
  paypalLive: boolean;
}

/**
 * 查询后端开通了哪些境外支付方式。
 *
 * 前端拿不到后端密钥，也就没法自己判断。查不到时按「都没开通」处理，
 * 用户看到的是「暂未开通」，而不是一个点了报错的按钮。
 */
export async function getIntlPaymentConfig(): Promise<IntlPaymentConfig> {
  const session = await auth();
  if (!session?.user) return { stripe: false, paypal: false, paypalLive: false };

  try {
    const d = await apiFetch<{ stripe?: boolean; paypal?: boolean; paypal_live?: boolean }>(
      "/api/payments/intl/config",
    );
    return { stripe: Boolean(d.stripe), paypal: Boolean(d.paypal), paypalLive: Boolean(d.paypal_live) };
  } catch {
    return { stripe: false, paypal: false, paypalLive: false };
  }
}

/** 创建境外支付订单，返回要跳转的地址 */
export async function startIntlCheckout(
  planCode: string,
  periodMonths: number,
  provider: PayProvider,
): Promise<CheckoutResult> {
  const session = await auth();
  if (!session?.user) throw new Error("请先登录");

  try {
    const d = await apiFetch<{
      order_id: string;
      provider: PayProvider;
      url: string;
      amount_cents: number;
      currency: string;
    }>("/api/payments/intl/checkout", {
      method: "POST",
      body: { planCode, periodMonths, provider },
    });

    return {
      orderId: d.order_id,
      provider: d.provider,
      url: d.url,
      amountCents: d.amount_cents,
      currency: d.currency,
    };
  } catch (e) {
    if (e instanceof ApiError) throw new Error(e.message);
    throw new Error("发起支付失败，请稍后重试");
  }
}

/**
 * 用户从 Stripe 回跳后核对支付结果。
 *
 * 不依赖 webhook：它会延迟，用户付完立刻回来看不到到账会以为失败并重复付款。
 */
export async function syncStripeOrder(orderId: string): Promise<{ paid: boolean; status: string }> {
  const session = await auth();
  if (!session?.user) throw new Error("请先登录");

  try {
    return await apiFetch<{ paid: boolean; status: string }>("/api/payments/stripe/sync", {
      method: "POST",
      body: { orderId },
    });
  } catch (e) {
    if (e instanceof ApiError) throw new Error(e.message);
    throw new Error("核对支付结果失败");
  }
}

/** 用户从 PayPal 回跳后扣款。PayPal 以这一步为准 */
export async function capturePaypalOrder(orderId: string): Promise<{ paid: boolean }> {
  const session = await auth();
  if (!session?.user) throw new Error("请先登录");

  try {
    return await apiFetch<{ paid: boolean }>("/api/payments/paypal/capture", {
      method: "POST",
      body: { orderId },
    });
  } catch (e) {
    if (e instanceof ApiError) throw new Error(e.message);
    throw new Error("确认 PayPal 付款失败");
  }
}
