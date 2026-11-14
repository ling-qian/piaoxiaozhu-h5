/**
 * Dodo 回调与回跳核对的回归。
 *
 * 这层决定「付了钱有没有到账」。出错的两种方式都不会抛异常：
 * 钱扣了没发货，或者没扣钱却发了货。所以断言集中在订单状态、积分记录，
 * 以及外部查询被调用的次数上。
 *
 * 外部服务全部 mock，D1 用内存替身，被测的是真实路由代码。
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../env";
import { errorHandler } from "../lib/http";
import paymentsDodo from "./payments-dodo";

// ──────────────────────────────────────────── 内存 D1 替身

interface Order {
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

interface Store {
  orders: Map<string, Order>;
  users: Map<string, { plan_code: string; plan_expires_at: string | null }>;
  logs: { user_id: string; action: string; delta: number }[];
}

function makeDb() {
  const store: Store = {
    orders: new Map(),
    users: new Map([["user-1", { plan_code: "free", plan_expires_at: null }]]),
    logs: [],
  };

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("UPDATE orders SET transaction_id")) {
                // (transaction_id, id)
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
                // (id, user_id, action, delta, ...)
                store.logs.push({
                  user_id: String(args[1]),
                  action: String(args[2]),
                  delta: Number(args[3]),
                });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE users")) {
                // (plan_code, plan_expires_at, user_id)
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

function seedOrder(store: Store, overrides: Partial<Order> = {}) {
  const order: Order = {
    id: "order-1",
    user_id: "user-1",
    plan_code: "pro",
    amount_cents: 399,
    period_months: 1,
    status: "pending",
    currency: "USD",
    provider: "dodo",
    transaction_id: null,
    paid_at: null,
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
  store.orders.set(order.id, order);
  return order;
}

// ──────────────────────────────────────────── 应用与 env

const USER = { id: "user-1", nickname: "Test", plan_code: "free" } as never;

function makeApp(user: unknown = USER) {
  const app = new Hono<{ Bindings: Env; Variables: { user: never } }>();
  app.use("*", async (c, next) => {
    c.set("user", user as never);
    await next();
  });
  app.route("/", paymentsDodo);
  app.onError(errorHandler);
  return app;
}

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

// ──────────────────────────────────────────── 回调验签

const SECRET = "whsec_dGVzdC1zZWNyZXQ=";

/** 按 Standard Webhooks 的算法独立生成签名 */
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

async function signedHeaders(raw: string, secret = SECRET) {
  const id = "msg_1";
  const ts = String(Math.floor(Date.now() / 1000));
  return {
    "Content-Type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": ts,
    "webhook-signature": await sign(secret, id, ts, raw),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────── 回调

describe("POST /payments/dodo/webhook", () => {
  it("没配签名密钥时返回 503，让 Dodo 重试而不是默认放行", async () => {
    const { db } = makeDb();
    const raw = JSON.stringify({ type: "payment.succeeded" });
    const res = await post(makeApp(), "/payments/dodo/webhook", raw, makeEnv(db), await signedHeaders(raw));

    expect(res.status).toBe(503);
  });

  it("签名不对返回 401，订单保持 pending", async () => {
    const { db, store } = makeDb();
    seedOrder(store);
    const raw = JSON.stringify({ type: "payment.succeeded", data: { metadata: { order_id: "order-1" } } });
    const headers = { ...(await signedHeaders(raw)), "webhook-signature": `v1,${"A".repeat(43)}` };

    const res = await post(makeApp(), "/payments/dodo/webhook", raw, makeEnv(db, { DODO_WEBHOOK_SECRET: SECRET }), headers);

    expect(res.status).toBe(401);
    expect(store.orders.get("order-1")!.status).toBe("pending");
  });

  it("非 payment.succeeded 的事件只确认收到，不发货", async () => {
    const { db, store } = makeDb();
    seedOrder(store);
    const raw = JSON.stringify({
      type: "payment.failed",
      data: { payment_id: "pay_1", metadata: { order_id: "order-1" } },
    });

    const res = await post(makeApp(), "/payments/dodo/webhook", raw, makeEnv(db, { DODO_WEBHOOK_SECRET: SECRET }), await signedHeaders(raw));

    expect(res.status).toBe(200);
    expect(store.orders.get("order-1")!.status).toBe("pending");
    expect(store.logs).toHaveLength(0);
  });

  it("支付成功回调发货，并记下 payment_id", async () => {
    const { db, store } = makeDb();
    seedOrder(store);
    const raw = JSON.stringify({
      type: "payment.succeeded",
      data: {
        payment_id: "pay_1",
        total_amount: 399,
        currency: "USD",
        metadata: { order_id: "order-1" },
      },
    });

    const res = await post(makeApp(), "/payments/dodo/webhook", raw, makeEnv(db, { DODO_WEBHOOK_SECRET: SECRET }), await signedHeaders(raw));

    expect(res.status).toBe(200);
    const order = store.orders.get("order-1")!;
    expect(order.status).toBe("paid");
    expect(order.transaction_id).toBe("pay_1");
    expect(store.logs.length).toBeGreaterThan(0);
    expect(store.users.get("user-1")!.plan_code).toBe("pro");
  });

  it("重复回调不重复发积分", async () => {
    const { db, store } = makeDb();
    seedOrder(store);
    const raw = JSON.stringify({
      type: "payment.succeeded",
      data: { payment_id: "pay_1", total_amount: 399, metadata: { order_id: "order-1" } },
    });
    const env = makeEnv(db, { DODO_WEBHOOK_SECRET: SECRET });
    const headers = await signedHeaders(raw);

    await post(makeApp(), "/payments/dodo/webhook", raw, env, headers);
    const grantCount = store.logs.length;

    const res = await post(makeApp(), "/payments/dodo/webhook", raw, env, headers);

    expect(res.status).toBe(200);
    expect(store.logs).toHaveLength(grantCount);
  });

  it("金额和本地订单不一致时只记日志，仍然发货", async () => {
    // 产品价格配在 Dodo 后台，含税价可能高于本地净价，严格相等会误拒真实付款
    const { db, store } = makeDb();
    seedOrder(store);
    const raw = JSON.stringify({
      type: "payment.succeeded",
      data: { payment_id: "pay_1", total_amount: 499, metadata: { order_id: "order-1" } },
    });

    const res = await post(makeApp(), "/payments/dodo/webhook", raw, makeEnv(db, { DODO_WEBHOOK_SECRET: SECRET }), await signedHeaders(raw));

    expect(res.status).toBe(200);
    expect(store.orders.get("order-1")!.status).toBe("paid");
  });

  it("回调指向不存在的订单时返回 200，避免 Dodo 无限重试", async () => {
    const { db } = makeDb();
    const raw = JSON.stringify({
      type: "payment.succeeded",
      data: { payment_id: "pay_1", metadata: { order_id: "order-404" } },
    });

    const res = await post(makeApp(), "/payments/dodo/webhook", raw, makeEnv(db, { DODO_WEBHOOK_SECRET: SECRET }), await signedHeaders(raw));

    expect(res.status).toBe(200);
    expect(((await res.json()) as any).received).toBe(true);
  });
});

// ──────────────────────────────────────────── 回跳核对

describe("POST /payments/dodo/sync", () => {
  const dodoEnv = (db: D1Database) =>
    makeEnv(db, { DODO_API_KEY: "dodo_test_key", DODO_ENV: "test" });

  it("订单已支付时直接返回，不再查外部接口", async () => {
    const { db, store } = makeDb();
    seedOrder(store, { status: "paid", transaction_id: "pay_9" });

    const res = await post(makeApp(), "/payments/dodo/sync", { orderId: "order-1" }, dodoEnv(db));

    expect(res.status).toBe(200);
    expect((await res.json()) as any).toMatchObject({ paid: true, status: "paid" });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("不能核对别人的订单", async () => {
    const { db, store } = makeDb();
    seedOrder(store, { user_id: "user-2" });

    const res = await post(makeApp(), "/payments/dodo/sync", { orderId: "order-1" }, dodoEnv(db));

    expect(res.status).toBe(404);
  });

  it("订单不是 Dodo 支付时拒绝", async () => {
    const { db, store } = makeDb();
    seedOrder(store, { provider: "stripe" });

    const res = await post(makeApp(), "/payments/dodo/sync", { orderId: "order-1" }, dodoEnv(db));

    expect(res.status).toBe(400);
  });

  it("建单时既没有会话也没有支付 ID 时返回 pending", async () => {
    const { db, store } = makeDb();
    seedOrder(store, { transaction_id: null });

    const res = await post(makeApp(), "/payments/dodo/sync", { orderId: "order-1" }, dodoEnv(db));

    expect(res.status).toBe(200);
    expect((await res.json()) as any).toMatchObject({ paid: false, status: "pending" });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("会话已支付时补成 payment_id 并发货", async () => {
    const { db, store } = makeDb();
    seedOrder(store, { transaction_id: "cks_1" });
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/checkouts/cks_1")) {
        return new Response(
          JSON.stringify({ id: "cks_1", payment_id: "pay_1", payment_status: "succeeded" }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({ payment_id: "pay_1", status: "succeeded", total_amount: 399, currency: "USD" }),
        { status: 200 }
      );
    });

    const res = await post(makeApp(), "/payments/dodo/sync", { orderId: "order-1" }, dodoEnv(db));

    expect(res.status).toBe(200);
    expect((await res.json()) as any).toMatchObject({ paid: true, status: "paid" });
    const order = store.orders.get("order-1")!;
    expect(order.status).toBe("paid");
    // 会话 ID 被换成支付 ID，后续 webhook 和重复核对都省一次查询
    expect(order.transaction_id).toBe("pay_1");
  });

  it("会话还没付款时保持 pending", async () => {
    const { db, store } = makeDb();
    seedOrder(store, { transaction_id: "cks_1" });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "cks_1", payment_id: null, payment_status: "pending" }), { status: 200 })
    );

    const res = await post(makeApp(), "/payments/dodo/sync", { orderId: "order-1" }, dodoEnv(db));

    expect(res.status).toBe(200);
    expect((await res.json()) as any).toMatchObject({ paid: false, status: "pending" });
    expect(store.orders.get("order-1")!.status).toBe("pending");
  });

  it("密钥和环境不匹配时返回 500，不拿测试密钥去查线上", async () => {
    const { db, store } = makeDb();
    seedOrder(store, { transaction_id: "pay_1" });
    const env = makeEnv(db, { DODO_API_KEY: "dodo_live_key", DODO_ENV: "test" });

    const res = await post(makeApp(), "/payments/dodo/sync", { orderId: "order-1" }, env);

    expect(res.status).toBe(500);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
