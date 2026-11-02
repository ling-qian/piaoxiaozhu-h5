/**
 * 支付路由的失败回归。
 *
 * ## 为什么单独测这一层
 *
 * 已有的单测覆盖了三块纯逻辑：签名校验、美元定价、发货幂等。但它们都不回答
 * 一个更实际的问题——**用户付了钱、或者付款失败时，接口到底返回什么、有没有发货**。
 *
 * 这一层最容易出的事故是「钱扣了但没到账」和「没扣钱却发了货」。两种都不会抛异常，
 * 只会安静地错。所以这里的断言集中在两件事上：HTTP 状态码，以及订单和积分表的状态。
 *
 * ## 怎么测
 *
 * 不用真网络：`fetch` 被替换成桩函数，D1 用内存替身。被测的是真实路由代码，
 * 包括参数校验、订单状态迁移和权益发放，只有外部服务是假的。
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../env";
import { errorHandler } from "../lib/http";
import paymentsIntl from "./payments-intl";

// ──────────────────────────────────────────── 内存 D1 替身

interface Store {
  orders: Map<
    string,
    {
      id: string;
      user_id: string;
      plan_code: string;
      amount_cents: number;
      period_months: number;
      status: string;
      currency: string;
      provider: string;
      transaction_id: string | null;
      paid_at: string | null;
      created_at: string;
    }
  >;
  users: Map<string, { plan_code: string; plan_expires_at: string | null }>;
  logs: { user_id: string; action: string; delta: number }[];
}

function makeDb(seed?: Partial<Store>) {
  const store: Store = {
    orders: seed?.orders ?? new Map(),
    users: seed?.users ?? new Map([["user-1", { plan_code: "free", plan_expires_at: null }]]),
    logs: [],
  };

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO orders")) {
                // (id, user_id, plan_code, amount_cents, created_at, period_months, provider)
                const [id, userId, planCode, amount, createdAt, months, provider] = args;
                store.orders.set(String(id), {
                  id: String(id),
                  user_id: String(userId),
                  plan_code: String(planCode),
                  amount_cents: Number(amount),
                  period_months: Number(months),
                  status: "pending",
                  currency: "USD",
                  provider: String(provider),
                  transaction_id: null,
                  paid_at: null,
                  created_at: String(createdAt),
                });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE orders SET status = 'failed'")) {
                const row = store.orders.get(String(args[0]));
                if (row) row.status = "failed";
                return { meta: { changes: row ? 1 : 0 } };
              }
              if (sql.includes("UPDATE orders SET transaction_id")) {
                const row = store.orders.get(String(args[1]));
                if (row) row.transaction_id = String(args[0]);
                return { meta: { changes: row ? 1 : 0 } };
              }
              if (sql.includes("SET status = 'paid'")) {
                // (paid_at, transaction_id, id)
                const row = store.orders.get(String(args[2]));
                if (!row || row.status === "paid") return { meta: { changes: 0 } };
                row.status = "paid";
                row.paid_at = String(args[0]);
                row.transaction_id = String(args[1]);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO quota_logs")) {
                store.logs.push({
                  user_id: String(args[1]),
                  action: String(args[2]),
                  delta: Number(args[3]),
                });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE users")) {
                const u = store.users.get(String(args[2]));
                if (u) {
                  u.plan_code = String(args[0]);
                  u.plan_expires_at = String(args[1]);
                }
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 1 } };
            },
            async first<T>() {
              if (sql.includes("FROM orders")) {
                return (store.orders.get(String(args[0])) ?? null) as T;
              }
              if (sql.includes("SELECT plan_expires_at FROM users")) {
                return ({ plan_expires_at: store.users.get(String(args[0]))?.plan_expires_at ?? null }) as T;
              }
              return null as T;
            },
          };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, store };
}

// ──────────────────────────────────────────── 测试用的应用与 env

const USER = { id: "user-1", nickname: "Test", plan_code: "free" } as never;
const OTHER = { id: "user-2", nickname: "Other", plan_code: "free" } as never;

function makeApp(user: unknown = USER) {
  const app = new Hono<{ Bindings: Env; Variables: { user: never } }>();
  app.use("*", async (c, next) => {
    c.set("user", user as never);
    await next();
  });
  app.route("/", paymentsIntl);
  app.onError(errorHandler);
  return app;
}

/** 最小可用 env。每个测试按需覆盖其中字段 */
function makeEnv(db: D1Database, extra: Partial<Env> = {}): Env {
  return {
    DB: db,
    JWT_SECRET: "test",
    JWT_ALGORITHM: "HS256",
    APP_ENV: "test",
    APP_BASE_URL: "https://example.com",
    LLM_BASE_URL: "https://example.com/v1",
    LLM_MODEL_NAME: "agnes-3.0-flash",
    ...extra,
  } as Env;
}

async function post(app: Hono<any>, path: string, body: unknown, env: Env, headers: Record<string, string> = {}) {
  return app.request(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    env
  );
}

/** 按 Stripe 算法生成合法签名 */
async function stripeSig(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────── 下单

describe("POST /payments/intl/checkout", () => {
  it("拒绝未知 provider", async () => {
    const { db } = makeDb();
    const res = await post(makeApp(), "/payments/intl/checkout", { planCode: "pro", provider: "alipay" }, makeEnv(db));
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).detail).toContain("provider");
  });

  it("免费版没有美元价，拒绝下单", async () => {
    const { db } = makeDb();
    const res = await post(makeApp(), "/payments/intl/checkout", { planCode: "free", provider: "stripe" }, makeEnv(db));
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).detail).toContain("不支持美元结算");
  });

  it("缺 APP_BASE_URL 时拒绝下单——Stripe 要求绝对回跳地址", async () => {
    const { db } = makeDb();
    const env = makeEnv(db, { APP_BASE_URL: "", STRIPE_SECRET_KEY: "sk_test_x" });
    const res = await post(makeApp(), "/payments/intl/checkout", { planCode: "pro", provider: "stripe" }, env);
    expect(res.status).toBe(500);
    expect(((await res.json()) as any).detail).toContain("APP_BASE_URL");
  });

  it("Stripe 未配置时返回 500，且订单被标为 failed 而不是留在 pending", async () => {
    const { db, store } = makeDb();
    const res = await post(makeApp(), "/payments/intl/checkout", { planCode: "pro", provider: "stripe" }, makeEnv(db));

    expect(res.status).toBe(500);
    expect(((await res.json()) as any).detail).toContain("Stripe 未配置");
    // 关键：失败的下单不能留 pending 脏数据
    const order = [...store.orders.values()][0]!;
    expect(order.status).toBe("failed");
  });

  it("PayPal 未配置时返回 500", async () => {
    const { db } = makeDb();
    const res = await post(makeApp(), "/payments/intl/checkout", { planCode: "pro", provider: "paypal" }, makeEnv(db));
    expect(res.status).toBe(500);
    expect(((await res.json()) as any).detail).toContain("PayPal 未配置");
  });

  it("Stripe 正常下单：返回收银页地址，记下 session id", async () => {
    const { db, store } = makeDb();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/x" }), { status: 200 })
    );

    const env = makeEnv(db, { STRIPE_SECRET_KEY: "sk_test_x" });
    const res = await post(makeApp(), "/payments/intl/checkout", { planCode: "pro", provider: "stripe" }, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.url).toBe("https://checkout.stripe.com/x");
    expect(body.amount_cents).toBe(399);
    expect(body.currency).toBe("USD");

    const order = store.orders.get(body.order_id)!;
    expect(order.status).toBe("pending");
    expect(order.transaction_id).toBe("cs_test_1");
  });

  it("PayPal 正常下单：返回 approve 链接", async () => {
    const { db } = makeDb();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          id: "PAYPAL-1",
          links: [
            { rel: "self", href: "https://api/x" },
            { rel: "approve", href: "https://paypal.com/approve" },
          ],
        }),
        { status: 200 }
      );
    });

    const env = makeEnv(db, { PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "sec" });
    const res = await post(makeApp(), "/payments/intl/checkout", { planCode: "pro", provider: "paypal" }, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.url).toBe("https://paypal.com/approve");
  });
});

// ──────────────────────────────────────────── Stripe 回调

describe("POST /payments/stripe/webhook", () => {
  const SECRET = "whsec_test";
  const now = () => Math.floor(Date.now() / 1000);

  function seedOrder(status = "pending") {
    const { db, store } = makeDb();
    store.orders.set("order-1", {
      id: "order-1",
      user_id: "user-1",
      plan_code: "pro",
      amount_cents: 399,
      period_months: 1,
      status,
      currency: "USD",
      provider: "stripe",
      transaction_id: "cs_test_1",
      paid_at: null,
      created_at: new Date().toISOString(),
    });
    return { db, store };
  }

  it("未配 STRIPE_WEBHOOK_SECRET 时返回 500——宁可不处理也不能盲信请求体", async () => {
    const { db } = seedOrder();
    const res = await post(makeApp(), "/payments/stripe/webhook", {}, makeEnv(db));
    expect(res.status).toBe(500);
  });

  it("签名不符返回 400", async () => {
    const { db, store } = seedOrder();
    const env = makeEnv(db, { STRIPE_WEBHOOK_SECRET: SECRET });
    const payload = JSON.stringify({ type: "checkout.session.completed" });

    const res = await post(
      makeApp(),
      "/payments/stripe/webhook",
      payload,
      env,
      { "stripe-signature": `t=${now()},v1=${"0".repeat(64)}` }
    );

    expect(res.status).toBe(400);
    expect(store.orders.get("order-1")!.status).toBe("pending"); // 未发货
  });

  it("非目标事件类型直接 200，不发货", async () => {
    const { db, store } = seedOrder();
    const env = makeEnv(db, { STRIPE_WEBHOOK_SECRET: SECRET });
    const payload = JSON.stringify({ type: "payment_intent.created" });
    const sig = await stripeSig(SECRET, now(), payload);

    const res = await post(makeApp(), "/payments/stripe/webhook", payload, env, { "stripe-signature": sig });

    expect(res.status).toBe(200);
    expect(store.orders.get("order-1")!.status).toBe("pending");
    expect(store.logs).toHaveLength(0);
  });

  it("metadata 缺 order_id 时 200 但不发火", async () => {
    const { db, store } = seedOrder();
    const env = makeEnv(db, { STRIPE_WEBHOOK_SECRET: SECRET });
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_test_1" } } });
    const sig = await stripeSig(SECRET, now(), payload);

    const res = await post(makeApp(), "/payments/stripe/webhook", payload, env, { "stripe-signature": sig });

    expect(res.status).toBe(200);
    expect(store.orders.get("order-1")!.status).toBe("pending");
  });

  it("订单不存在时 200 且不报错——过期回调不该让 Stripe 一直重推", async () => {
    const { db, store } = makeDb();
    const env = makeEnv(db, { STRIPE_WEBHOOK_SECRET: SECRET });
    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", metadata: { order_id: "不存在的订单" } } },
    });
    const sig = await stripeSig(SECRET, now(), payload);

    const res = await post(makeApp(), "/payments/stripe/webhook", payload, env, { "stripe-signature": sig });
    expect(res.status).toBe(200);
    expect(store.logs).toHaveLength(0);
  });

  it("正常回调：订单置 paid 并发出 300 积分", async () => {
    const { db, store } = seedOrder();
    const env = makeEnv(db, { STRIPE_WEBHOOK_SECRET: SECRET });
    const payload = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", metadata: { order_id: "order-1" } } },
    });
    const sig = await stripeSig(SECRET, now(), payload);

    const res = await post(makeApp(), "/payments/stripe/webhook", payload, env, { "stripe-signature": sig });

    expect(res.status).toBe(200);
    expect(store.orders.get("order-1")!.status).toBe("paid");
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]!.delta).toBe(300);
  });
});

// ──────────────────────────────────────────── Stripe 回跳核对

describe("POST /payments/stripe/sync", () => {
  function seedOrder(userId = "user-1", status = "pending") {
    const { db, store } = makeDb();
    store.orders.set("order-1", {
      id: "order-1",
      user_id: userId,
      plan_code: "pro",
      amount_cents: 399,
      period_months: 1,
      status,
      currency: "USD",
      provider: "stripe",
      transaction_id: "cs_test_1",
      paid_at: null,
      created_at: new Date().toISOString(),
    });
    return { db, store };
  }

  it("订单不存在返回 404", async () => {
    const { db } = makeDb();
    const env = makeEnv(db, { STRIPE_SECRET_KEY: "sk_test_x" });
    const res = await post(makeApp(), "/payments/stripe/sync", { orderId: "nope" }, env);
    expect(res.status).toBe(404);
  });

  it("别人的订单返回 404，不泄露存在性", async () => {
    // 订单属于 user-1，但用 user-2 的身份去查
    const { db } = seedOrder("user-1");
    const env = makeEnv(db, { STRIPE_SECRET_KEY: "sk_test_x" });
    const res = await post(makeApp(OTHER), "/payments/stripe/sync", { orderId: "order-1" }, env);
    expect(res.status).toBe(404);
  });

  it("未支付时返回 paid:false，不发货", async () => {
    const { db, store } = seedOrder();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "cs_test_1", status: "open", payment_status: "unpaid" }), { status: 200 })
    );

    const env = makeEnv(db, { STRIPE_SECRET_KEY: "sk_test_x" });
    const res = await post(makeApp(), "/payments/stripe/sync", { orderId: "order-1" }, env);

    expect(res.status).toBe(200);
    expect(((await res.json()) as any).paid).toBe(false);
    expect(store.orders.get("order-1")!.status).toBe("pending");
  });

  it("已支付时补发权益", async () => {
    const { db, store } = seedOrder();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "cs_test_1", status: "complete", payment_status: "paid" }), { status: 200 })
    );

    const env = makeEnv(db, { STRIPE_SECRET_KEY: "sk_test_x" });
    const res = await post(makeApp(), "/payments/stripe/sync", { orderId: "order-1" }, env);

    expect(res.status).toBe(200);
    expect(((await res.json()) as any).paid).toBe(true);
    expect(store.orders.get("order-1")!.status).toBe("paid");
    expect(store.logs[0]!.delta).toBe(300);
  });
});

// ──────────────────────────────────────────── PayPal 扣款

describe("POST /payments/paypal/capture", () => {
  function seedOrder(amount = 399, currency = "USD") {
    const { db, store } = makeDb();
    store.orders.set("order-1", {
      id: "order-1",
      user_id: "user-1",
      plan_code: "pro",
      amount_cents: amount,
      period_months: 1,
      status: "pending",
      currency,
      provider: "paypal",
      transaction_id: "PAYPAL-1",
      paid_at: null,
      created_at: new Date().toISOString(),
    });
    return { db, store };
  }

  function mockPaypal(captureValue: string, currencyCode = "USD", status = "COMPLETED") {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          status,
          purchase_units: [
            { payments: { captures: [{ id: "CAP-1", amount: { currency_code: currencyCode, value: captureValue } }] } },
          ],
        }),
        { status: 200 }
      );
    });
  }

  const env = (db: D1Database) => makeEnv(db, { PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "sec" });

  it("实付金额小于订单金额时拒绝发货", async () => {
    const { db, store } = seedOrder(399);
    mockPaypal("0.01");

    const res = await post(makeApp(), "/payments/paypal/capture", { orderId: "order-1" }, env(db));

    expect(res.status).toBe(400);
    expect(((await res.json()) as any).detail).toContain("不一致");
    // 关键：钱没付够，权益一分不发
    expect(store.orders.get("order-1")!.status).toBe("pending");
    expect(store.logs).toHaveLength(0);
  });

  it("实付金额大于订单金额同样拒绝——避免有人改前端金额后多拿权益", async () => {
    const { db, store } = seedOrder(399);
    mockPaypal("999.00");

    const res = await post(makeApp(), "/payments/paypal/capture", { orderId: "order-1" }, env(db));
    expect(res.status).toBe(400);
    expect(store.logs).toHaveLength(0);
  });

  it("币种不符时拒绝发货", async () => {
    const { db, store } = seedOrder(399, "USD");
    mockPaypal("3.99", "EUR");

    const res = await post(makeApp(), "/payments/paypal/capture", { orderId: "order-1" }, env(db));
    expect(res.status).toBe(400);
    expect(store.logs).toHaveLength(0);
  });

  it("PayPal 状态不是 COMPLETED 时拒绝发货", async () => {
    const { db, store } = seedOrder(399);
    mockPaypal("3.99", "USD", "PENDING");

    const res = await post(makeApp(), "/payments/paypal/capture", { orderId: "order-1" }, env(db));
    expect(res.status).toBe(500); // paypalCaptureOrder 抛错，被包成服务端错误
    expect(store.orders.get("order-1")!.status).toBe("pending");
  });

  it("金额与币种都对时发货", async () => {
    const { db, store } = seedOrder(399);
    mockPaypal("3.99");

    const res = await post(makeApp(), "/payments/paypal/capture", { orderId: "order-1" }, env(db));

    expect(res.status).toBe(200);
    expect(((await res.json()) as any).paid).toBe(true);
    expect(store.orders.get("order-1")!.status).toBe("paid");
    expect(store.logs[0]!.delta).toBe(300);
  });

  it("重复扣款不会重复发权益", async () => {
    const { db, store } = seedOrder(399);
    store.orders.get("order-1")!.status = "paid"; // 已发货
    mockPaypal("3.99");

    const res = await post(makeApp(), "/payments/paypal/capture", { orderId: "order-1" }, env(db));

    expect(res.status).toBe(200);
    // 已 paid 的订单直接返回，不会二次发放
    expect(store.logs).toHaveLength(0);
  });
});
