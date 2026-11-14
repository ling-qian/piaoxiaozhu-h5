/**
 * Dodo Payments 客户端。
 *
 * Dodo 是 MoR（Merchant of Record），VAT 和销售税由它代收代缴，
 * 我们只负责把产品和价格挂上去。
 *
 * 和 Stripe 一样走 REST 直连，不装官方 SDK：Worker 对打包体积敏感，
 * 我们只用「建结账会话 + 查支付状态 + 验签」三个接口。
 *
 * ## 金额单位
 *
 * Dodo 的 `total_amount` 是最小货币单位的整数，USD 就是美分。
 * 本地订单也存美分，两边直接比较，不经过浮点数。
 */

/** 测试环境与正式环境是两个完全独立的域名，配错了会拿测试数据当真 */
function dodoBase(env: string | undefined): string {
  return env === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

/**
 * 密钥前缀必须和声明的环境一致。
 *
 * 测试密钥配到线上，任何人都能用测试卡下单白拿 Pro，这个坑已经踩过一次。
 * 两个方向都拦：测试密钥声明成 live 挡掉，live 密钥忘了声明 live 也挡掉，
 * 逼着配置的人把 `DODO_ENV` 写清楚。
 */
export function dodoKeyMatchesEnv(apiKey: string | undefined, env: string | undefined): boolean {
  if (!apiKey) return false;
  return apiKey.startsWith("dodo_live_") === (env === "live");
}

export interface DodoCheckoutParams {
  apiKey: string;
  env?: string;
  /** 在 Dodo 后台建好的产品 ID，形如 pdt_xxx */
  productId: string;
  /** 我们自己的订单号。写进 metadata，回调和查单时靠它找回订单 */
  orderId: string;
  /** 支付完成后跳回的地址 */
  returnUrl: string;
  customerEmail?: string;
}

/**
 * 创建结账会话，返回 Dodo 托管的收银页地址。
 *
 * 金额不由这里传：Dodo 按产品上配置的价格收费。
 * 所以后台改价之后，本地 `plans.ts` 里的价格必须同步改，
 * 否则会出现「页面显示 $3.99、实收 $4.99」这种对不上的情况。
 */
export async function dodoCreateCheckout(
  p: DodoCheckoutParams
): Promise<{ sessionId: string; checkoutUrl: string; paymentId: string | null }> {
  const body: Record<string, unknown> = {
    product_cart: [{ product_id: p.productId, quantity: 1 }],
    return_url: p.returnUrl,
    metadata: { order_id: p.orderId },
  };
  if (p.customerEmail) {
    body.customer = { email: p.customerEmail };
  }

  const res = await fetch(`${dodoBase(p.env)}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    session_id?: string;
    checkout_url?: string;
    payment_id?: string;
    message?: string;
    code?: string;
  };

  if (!res.ok || !data.checkout_url) {
    throw new Error(data.message || `Dodo 创建支付页失败（${res.status}）`);
  }
  return {
    sessionId: data.session_id ?? "",
    checkoutUrl: data.checkout_url,
    paymentId: data.payment_id ?? null,
  };
}

export interface DodoPayment {
  paymentId: string;
  status: string;
  /** 美分 */
  amountCents: number;
  currency: string;
}

/** 查一笔支付的状态。前端回跳后用它当场核对，不必干等 webhook */
export async function dodoRetrievePayment(p: {
  apiKey: string;
  env?: string;
  paymentId: string;
}): Promise<DodoPayment> {
  const res = await fetch(
    `${dodoBase(p.env)}/payments/${encodeURIComponent(p.paymentId)}`,
    { headers: { Authorization: `Bearer ${p.apiKey}` } }
  );

  const data = (await res.json()) as {
    payment_id?: string;
    status?: string;
    total_amount?: number;
    currency?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.message || `Dodo 查询支付失败（${res.status}）`);
  }

  return {
    paymentId: data.payment_id ?? p.paymentId,
    status: data.status ?? "unknown",
    amountCents: Number(data.total_amount ?? 0),
    currency: data.currency ?? "",
  };
}

/**
 * 查结账会话。
 *
 * 建单时 Dodo 不一定立刻生成支付记录，所以响应里常常没有 `payment_id`。
 * 这时本地只能存会话 ID，回跳核对要靠这个接口反查：
 * 付款完成后 `payment_id` 才有值，`payment_status` 变成 succeeded。
 */
export async function dodoRetrieveCheckout(p: {
  apiKey: string;
  env?: string;
  sessionId: string;
}): Promise<{ sessionId: string; paymentId: string | null; paymentStatus: string | null }> {
  const res = await fetch(
    `${dodoBase(p.env)}/checkouts/${encodeURIComponent(p.sessionId)}`,
    { headers: { Authorization: `Bearer ${p.apiKey}` } }
  );

  const data = (await res.json()) as {
    id?: string;
    payment_id?: string | null;
    payment_status?: string | null;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.message || `Dodo 查询结账会话失败（${res.status}）`);
  }

  return {
    sessionId: data.id ?? p.sessionId,
    paymentId: data.payment_id ?? null,
    paymentStatus: data.payment_status ?? null,
  };
}

/**
 * 校验 Dodo 回调签名。
 *
 * Dodo 遵循 Standard Webhooks 规范：
 * 1. 待签名内容是三段用点号连接：`{webhook-id}.{webhook-timestamp}.{原始请求体}`
 * 2. 密钥以 `whsec_` 开头，去掉前缀后要做 base64 解码，得到真正的密钥字节
 * 3. 签名头是 `v1,<base64>` 形式，多条之间用空格分隔，任意一条匹配即通过
 * 4. 时间戳超过 5 分钟视为重放，直接拒绝
 *
 * 两个容易错的点：必须用原始请求体，不能 JSON.parse 再 stringify；
 * 密钥要先 base64 解码，直接拿字符串当密钥算出来的签名永远对不上。
 */
export async function verifyDodoSignature(p: {
  secret: string;
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  toleranceSec?: number;
}): Promise<boolean> {
  const { secret, rawBody, webhookId, webhookTimestamp, webhookSignature } = p;
  if (!secret || !webhookId || !webhookTimestamp || !webhookSignature) return false;

  const ts = Number(webhookTimestamp);
  if (!Number.isFinite(ts)) return false;
  const tolerance = p.toleranceSec ?? 300;
  if (Math.abs(Date.now() / 1000 - ts) > tolerance) return false;

  const rawKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    const bin = atob(rawKey);
    keyBytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    // 密钥不是合法的 base64 时按原字符串处理，避免整条回调直接 500
    keyBytes = new TextEncoder().encode(rawKey);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${webhookId}.${webhookTimestamp}.${rawBody}`)
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // 头部可能同时带多个版本，任意一个匹配即可。全量比较完再返回，避免时序泄露
  return webhookSignature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .some((part) => {
      const sig = part.slice(3);
      if (sig.length !== expected.length) return false;
      let diff = 0;
      for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
      return diff === 0;
    });
}
