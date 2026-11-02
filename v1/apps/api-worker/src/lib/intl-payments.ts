/**
 * 境外支付客户端：Stripe 与 PayPal。
 *
 * 都用 REST 直连而不是官方 SDK。原因：Worker 的打包体积和冷启动都敏感，
 * 两个 SDK 加起来几百 KB，而我们只用到「创建订单 + 验签」这几个接口。
 *
 * ## 金额单位
 *
 * Stripe 与 PayPal 的金额都是「最小货币单位的整数」：美元是美分。
 * 全程不出现浮点数，避免 0.1+0.2 那类误差进到支付金额里。
 */

// ──────────────────────────────────────────── Stripe

export interface StripeCheckoutParams {
  secretKey: string;
  /** 美分 */
  amountCents: number;
  currency: string;
  productName: string;
  /** 我们自己的订单号，回写进 session.metadata，回调时用它找到订单 */
  orderId: string;
  successUrl: string;
  cancelUrl: string;
  /** 下单用户，便于在 Stripe 后台按人查单 */
  customerEmail?: string;
}

/** 把普通对象编码成 Stripe 要求的 form-urlencoded（支持一层嵌套，如 metadata[x]） */
function toForm(params: Record<string, string | number | undefined>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join("&");
}

/** 创建 Stripe Checkout Session，返回可跳转的支付页地址 */
export async function stripeCreateCheckout(
  p: StripeCheckoutParams
): Promise<{ url: string; sessionId: string }> {
  const body = toForm({
    mode: "payment",
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": p.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": p.amountCents,
    "line_items[0][price_data][product_data][name]": p.productName,
  }) + "&" + toForm(
    {
      order_id: p.orderId,
      amount_cents: p.amountCents,
      currency: p.currency,
    },
    "metadata"
  ) + `&success_url=${encodeURIComponent(p.successUrl)}&cancel_url=${encodeURIComponent(p.cancelUrl)}`;

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // 同一个订单重复创建时返回同一个 session，避免用户连点生成多个支付页
      "Idempotency-Key": `checkout_${p.orderId}`,
    },
    body,
  });

  const data = (await res.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };

  if (!res.ok || !data.url || !data.id) {
    throw new Error(data.error?.message || `Stripe 创建支付页失败（${res.status}）`);
  }
  return { url: data.url, sessionId: data.id };
}

/**
 * 校验 Stripe 回调签名。
 *
 * 签名头形如 `t=1700000000,v1=abcd...,v1=ef01...`，算法是对
 * `${t}.${原始请求体}` 做 HMAC-SHA256 后取十六进制，再用密钥比对。
 *
 * 两个容易漏的点：
 * 1. 必须用**原始字符串**验签，JSON.parse 再 stringify 会改变空白导致签名不匹配
 * 2. 必须校验时间戳。否则别人拿到一个旧回调可以无限重放
 */
export async function verifyStripeSignature(
  secret: string,
  rawBody: string,
  sigHeader: string | null,
  toleranceSec = 300
): Promise<boolean> {
  if (!sigHeader) return false;

  let timestamp = "";
  const signatures: string[] = [];
  for (const part of sigHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v ?? "";
    else if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`)
  );
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // 长度一致才逐字符比较，且全量比较完再返回——避免按字符提前返回泄露时序
  return signatures.some((sig) => {
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

/** 查询 Checkout Session 的支付状态。用于前端回跳后当场核对 */
export async function stripeRetrieveSession(
  secretKey: string,
  sessionId: string
): Promise<{ id?: string; status?: string; paymentStatus?: string }> {
  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } }
  );
  const data = (await res.json()) as {
    id?: string;
    status?: string;
    payment_status?: string;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || `Stripe 查询失败（${res.status}）`);
  return { id: data.id, status: data.status, paymentStatus: data.payment_status };
}

// ──────────────────────────────────────────── PayPal

function paypalBase(env: string | undefined): string {
  // 只要不是明确的 live，一律走 sandbox。配错了宁可支付失败，也不能误扣真钱
  return env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

/** 取 PayPal OAuth2 令牌（client_credentials） */
async function paypalToken(
  base: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || `PayPal 授权失败（${res.status}）`);
  }
  return data.access_token;
}

export interface PaypalOrderParams {
  clientId: string;
  clientSecret: string;
  env?: string;
  /** 美分 */
  amountCents: number;
  currency: string;
  description: string;
  /** 我们自己的订单号，写进 purchase_units.custom_id 便于对账 */
  orderId: string;
  returnUrl: string;
  cancelUrl: string;
}

/** 创建 PayPal 订单，返回用户需要跳转去确认的地址 */
export async function paypalCreateOrder(
  p: PaypalOrderParams
): Promise<{ paypalOrderId: string; approveUrl: string }> {
  const base = paypalBase(p.env);
  const token = await paypalToken(base, p.clientId, p.clientSecret);

  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // 幂等：连点不会生成多个订单
      "PayPal-Request-Id": `order_${p.orderId}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: p.orderId,
          description: p.description.slice(0, 127),
          amount: {
            currency_code: p.currency,
            // PayPal 要求两位小数的字符串，不能传整数分
            value: (p.amountCents / 100).toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "SortReceipts",
        user_action: "PAY_NOW",
        return_url: p.returnUrl,
        cancel_url: p.cancelUrl,
      },
    }),
  });

  const data = (await res.json()) as {
    id?: string;
    links?: { rel: string; href: string }[];
    message?: string;
  };

  const approve = data.links?.find((l) => l.rel === "approve")?.href;
  if (!res.ok || !data.id || !approve) {
    throw new Error(data.message || `PayPal 创建订单失败（${res.status}）`);
  }
  return { paypalOrderId: data.id, approveUrl: approve };
}

/** 捕获（扣款）PayPal 订单。返回实付金额与币种，用于和本地订单核对 */
export async function paypalCaptureOrder(p: {
  clientId: string;
  clientSecret: string;
  env?: string;
  paypalOrderId: string;
}): Promise<{ status: string; amountCents: number; currency: string; captureId: string }> {
  const base = paypalBase(p.env);
  const token = await paypalToken(base, p.clientId, p.clientSecret);

  const res = await fetch(`${base}/v2/checkout/orders/${p.paypalOrderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = (await res.json()) as {
    status?: string;
    message?: string;
    purchase_units?: {
      payments?: {
        captures?: { id: string; amount: { currency_code: string; value: string } }[];
      };
    }[];
  };

  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  if (!res.ok || data.status !== "COMPLETED" || !capture) {
    throw new Error(data.message || `PayPal 扣款未完成（状态 ${data.status ?? "未知"}）`);
  }

  return {
    status: data.status,
    // 字符串 "3.99" 转回美分整数。用 Math.round 兜住浮点误差
    amountCents: Math.round(Number(capture.amount.value) * 100),
    currency: capture.amount.currency_code,
    captureId: capture.id,
  };
}
