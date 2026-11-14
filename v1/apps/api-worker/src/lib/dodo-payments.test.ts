/**
 * Dodo Payments 客户端的单测。
 *
 * 只测三件最容易出事、且不会抛异常的事：密钥和环境配错、回调验签、
 * 结账接口的失败处理。这三处错了都是安静地放行或安静地失败，
 * 线上表现为「测试卡白拿套餐」或「付了钱没到账」。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dodoCreateCheckout,
  dodoKeyMatchesEnv,
  dodoRetrieveCheckout,
  dodoRetrievePayment,
  verifyDodoSignature,
} from "./dodo-payments";

/** `whsec_` 后面是 base64 的 "test-secret"，和真实密钥格式一致 */
const SECRET = "whsec_dGVzdC1zZWNyZXQ=";

/** 按 Standard Webhooks 的算法独立生成签名，不复用被测实现 */
async function sign(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(raw), (ch) => ch.charCodeAt(0));
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
    new TextEncoder().encode(`${id}.${timestamp}.${body}`)
  );
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────── 密钥与环境

describe("dodoKeyMatchesEnv", () => {
  it("测试密钥只能用在非 live 环境", () => {
    expect(dodoKeyMatchesEnv("dodo_test_abc", "test")).toBe(true);
    expect(dodoKeyMatchesEnv("dodo_test_abc", undefined)).toBe(true);
    // 测试密钥配到线上等于免费送套餐，这是注释里明确说过踩过的坑
    expect(dodoKeyMatchesEnv("dodo_test_abc", "live")).toBe(false);
  });

  it("live 密钥没声明 DODO_ENV 时也拦掉", () => {
    expect(dodoKeyMatchesEnv("dodo_live_abc", "live")).toBe(true);
    expect(dodoKeyMatchesEnv("dodo_live_abc", undefined)).toBe(false);
    expect(dodoKeyMatchesEnv("dodo_live_abc", "test")).toBe(false);
  });

  it("没有密钥一律不放行", () => {
    expect(dodoKeyMatchesEnv(undefined, "test")).toBe(false);
    expect(dodoKeyMatchesEnv("", "test")).toBe(false);
  });
});

// ──────────────────────────────────────────── 回调验签

describe("verifyDodoSignature", () => {
  const id = "msg_1";
  const body = '{"type":"payment.succeeded"}';

  it("合法签名通过", async () => {
    const ts = String(nowSec());
    const signature = await sign(SECRET, id, ts, body);
    await expect(
      verifyDodoSignature({
        secret: SECRET,
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: signature,
      })
    ).resolves.toBe(true);
  });

  it("请求体被改过就失败——必须用原始文本验签", async () => {
    const ts = String(nowSec());
    const signature = await sign(SECRET, id, ts, body);
    await expect(
      verifyDodoSignature({
        secret: SECRET,
        rawBody: `${body} `,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: signature,
      })
    ).resolves.toBe(false);
  });

  it("超过 5 分钟的时间戳按重放拒绝", async () => {
    const ts = String(nowSec() - 301);
    const signature = await sign(SECRET, id, ts, body);
    await expect(
      verifyDodoSignature({
        secret: SECRET,
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: signature,
      })
    ).resolves.toBe(false);
  });

  it("头部带多个版本时，任意一条匹配即通过", async () => {
    const ts = String(nowSec());
    const signature = await sign(SECRET, id, ts, body);
    const header = `v1,${"A".repeat(43)} ${signature}`;
    await expect(
      verifyDodoSignature({
        secret: SECRET,
        rawBody: body,
        webhookId: id,
        webhookTimestamp: ts,
        webhookSignature: header,
      })
    ).resolves.toBe(true);
  });

  it("缺少任一签名头直接失败", async () => {
    const ts = String(nowSec());
    const signature = await sign(SECRET, id, ts, body);
    await expect(
      verifyDodoSignature({
        secret: SECRET,
        rawBody: body,
        webhookId: null,
        webhookTimestamp: ts,
        webhookSignature: signature,
      })
    ).resolves.toBe(false);
  });
});

// ──────────────────────────────────────────── 建单

describe("dodoCreateCheckout", () => {
  it("测试环境走测试域名，订单号写进 metadata", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: "cks_1",
          checkout_url: "https://checkout.dodopayments.com/x",
          payment_id: "pay_1",
        }),
        { status: 200 }
      )
    );

    const r = await dodoCreateCheckout({
      apiKey: "dodo_test_x",
      env: "test",
      productId: "pdt_1",
      orderId: "order-1",
      returnUrl: "https://app.test/member",
      customerEmail: "a@b.com",
    });

    expect(r).toEqual({
      sessionId: "cks_1",
      checkoutUrl: "https://checkout.dodopayments.com/x",
      paymentId: "pay_1",
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe("https://test.dodopayments.com/checkouts");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer dodo_test_x" });

    const sent = JSON.parse(String((init as RequestInit).body)) as {
      product_cart: unknown;
      metadata: Record<string, string>;
      customer: { email: string };
    };
    expect(sent.product_cart).toEqual([{ product_id: "pdt_1", quantity: 1 }]);
    expect(sent.metadata.order_id).toBe("order-1");
    expect(sent.customer.email).toBe("a@b.com");
  });

  it("live 环境走正式域名", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ checkout_url: "https://x" }), { status: 200 })
    );

    await dodoCreateCheckout({
      apiKey: "dodo_live_x",
      env: "live",
      productId: "pdt_1",
      orderId: "order-1",
      returnUrl: "https://app.test/member",
    });

    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toBe("https://live.dodopayments.com/checkouts");
  });

  it("非 2xx 时抛出服务商给的 message", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "invalid product" }), { status: 400 })
    );

    await expect(
      dodoCreateCheckout({
        apiKey: "dodo_test_x",
        productId: "pdt_1",
        orderId: "order-1",
        returnUrl: "https://app.test/member",
      })
    ).rejects.toThrow("invalid product");
  });

  it("返回 200 但没有收银页地址时也报错", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      dodoCreateCheckout({
        apiKey: "dodo_test_x",
        productId: "pdt_1",
        orderId: "order-1",
        returnUrl: "https://app.test/member",
      })
    ).rejects.toThrow("Dodo 创建支付页失败");
  });
});

// ──────────────────────────────────────────── 查询

describe("dodoRetrieveCheckout / dodoRetrievePayment", () => {
  it("会话已支付时带出 payment_id 和状态", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ id: "cks_1", payment_id: "pay_1", payment_status: "succeeded" }),
        { status: 200 }
      )
    );

    await expect(
      dodoRetrieveCheckout({ apiKey: "dodo_test_x", env: "test", sessionId: "cks_1" })
    ).resolves.toEqual({ sessionId: "cks_1", paymentId: "pay_1", paymentStatus: "succeeded" });
  });

  it("支付金额按最小货币单位返回，不做浮点换算", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          payment_id: "pay_1",
          status: "succeeded",
          total_amount: 399,
          currency: "USD",
        }),
        { status: 200 }
      )
    );

    await expect(
      dodoRetrievePayment({ apiKey: "dodo_test_x", env: "test", paymentId: "pay_1" })
    ).resolves.toEqual({ paymentId: "pay_1", status: "succeeded", amountCents: 399, currency: "USD" });
  });

  it("查询失败抛错，避免把未知状态当成已支付", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "not found" }), { status: 404 })
    );

    await expect(
      dodoRetrievePayment({ apiKey: "dodo_test_x", paymentId: "pay_404" })
    ).rejects.toThrow("not found");
  });
});
