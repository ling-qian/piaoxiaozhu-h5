/**
 * PayPal 定时对账的回归。
 *
 * ## 为什么测这一层
 *
 * 对账是后台任务，出问题没有用户点击来触发它——它要么安静地补发货，
 * 要么安静地不补。最危险的一条分支是「实收金额与订单不符」：这里如果不
 * 拦住，用户少付钱也会拿到会员；而如果误拦，用户钱付了却永远等不到套餐。
 * 两种都不会抛异常，只会在日志里留一行，所以必须用测试钉住。
 *
 * 另外两条：用户还没在 PayPal 批准时应该「下一轮再看」（不算失败），
 * 以及单笔异常不能中断整批。
 *
 * ## 怎么测
 *
 * PayPal 与发货都打桩。D1 用只支持 `all()` 的替身——对账只跑一条 SELECT。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../env";
import { PaypalCaptureError, paypalCaptureOrder, paypalRetrieveCaptures } from "./intl-payments";
import { fulfillOrder } from "./order-fulfill";
import { reconcilePaypalOrders } from "./paypal-reconcile";

vi.mock("./intl-payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./intl-payments")>();
  return { ...actual, paypalCaptureOrder: vi.fn(), paypalRetrieveCaptures: vi.fn() };
});
vi.mock("./order-fulfill", () => ({ fulfillOrder: vi.fn() }));

// ──────────────────────────────────────────── 测试替身

interface Row {
  id: string;
  user_id: string;
  plan_code: string;
  amount_cents: number;
  period_months: number;
  status: string;
  transaction_id: string | null;
  currency: string;
}

function makeOrder(overrides: Partial<Row> = {}): Row {
  return {
    id: "order-1",
    user_id: "user-1",
    plan_code: "pro",
    amount_cents: 399,
    period_months: 1,
    status: "pending",
    transaction_id: "PAYPAL-1",
    currency: "USD",
    ...overrides,
  };
}

/** 只实现对账用到的 `prepare().bind().all()` */
function makeDb(orders: Row[]) {
  const calls: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          calls.push({ sql, args });
          return {
            async all<T>() {
              return { results: orders as unknown as T[] };
            },
          };
        },
      };
    },
  };
  return { db: db as unknown as D1Database, calls };
}

function makeEnv(db: D1Database, extra: Partial<Env> = {}): Env {
  return {
    DB: db,
    PAYPAL_CLIENT_ID: "id",
    PAYPAL_CLIENT_SECRET: "sec",
    ...extra,
  } as Env;
}

const captureResult = (overrides: Record<string, unknown> = {}) => ({
  status: "COMPLETED",
  amountCents: 399,
  currency: "USD",
  captureId: "CAP-1",
  ...overrides,
});

beforeEach(() => {
  vi.mocked(paypalCaptureOrder).mockReset();
  vi.mocked(paypalRetrieveCaptures).mockReset();
  vi.mocked(fulfillOrder).mockReset().mockResolvedValue({ alreadyPaid: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────── 用例

describe("reconcilePaypalOrders", () => {
  it("未配置 PayPal 凭证时直接返回全 0，且不查库", async () => {
    const db = {
      prepare() {
        throw new Error("不应该查库");
      },
    } as unknown as D1Database;

    const res = await reconcilePaypalOrders(
      makeEnv(db, { PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "" })
    );

    expect(res).toEqual({ scanned: 0, paid: 0, failed: 0 });
    expect(paypalCaptureOrder).not.toHaveBeenCalled();
  });

  it("只扫 10 分钟前到 24 小时内的 pending 单，每批最多 8 单", async () => {
    const { db, calls } = makeDb([]);

    await reconcilePaypalOrders(makeEnv(db));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("provider = 'paypal'");
    expect(calls[0]!.sql).toContain("status = 'pending'");
    // bind(newest, oldest, BATCH)
    const [, oldest, batch] = calls[0]!.args;
    expect(String(oldest)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(batch).toBe(8);
  });

  it("缺 transaction_id 的订单跳过，不发起扣款", async () => {
    const { db } = makeDb([makeOrder({ transaction_id: null })]);

    const res = await reconcilePaypalOrders(makeEnv(db));

    expect(res).toEqual({ scanned: 1, paid: 0, failed: 0 });
    expect(paypalCaptureOrder).not.toHaveBeenCalled();
  });

  it("用户还没批准时不计失败，留到下一轮", async () => {
    const { db } = makeDb([makeOrder()]);
    vi.mocked(paypalCaptureOrder).mockRejectedValue(
      new PaypalCaptureError("ORDER_NOT_APPROVED", "订单未批准")
    );

    const res = await reconcilePaypalOrders(makeEnv(db));

    expect(res).toEqual({ scanned: 1, paid: 0, failed: 0 });
    expect(fulfillOrder).not.toHaveBeenCalled();
  });

  it("订单过期/不存在同样按「下轮再看」处理", async () => {
    for (const issue of ["ORDER_EXPIRED", "ORDER_NOT_FOUND", "INVALID_RESOURCE_ID"]) {
      vi.mocked(paypalCaptureOrder).mockRejectedValueOnce(new PaypalCaptureError(issue, issue));
      const { db } = makeDb([makeOrder()]);

      const res = await reconcilePaypalOrders(makeEnv(db));

      expect(res.failed).toBe(0);
      expect(fulfillOrder).not.toHaveBeenCalled();
    }
  });

  it("实收金额不符时不发货，只记一次失败", async () => {
    const { db } = makeDb([makeOrder({ amount_cents: 399 })]);
    vi.mocked(paypalCaptureOrder).mockResolvedValue(captureResult({ amountCents: 1 }) as never);

    const res = await reconcilePaypalOrders(makeEnv(db));

    expect(res).toEqual({ scanned: 1, paid: 0, failed: 1 });
    // 关键：钱没付够，一分权益都不发
    expect(fulfillOrder).not.toHaveBeenCalled();
  });

  it("币种不符同样不发火", async () => {
    const { db } = makeDb([makeOrder({ currency: "USD" })]);
    vi.mocked(paypalCaptureOrder).mockResolvedValue(captureResult({ currency: "EUR" }) as never);

    const res = await reconcilePaypalOrders(makeEnv(db));

    expect(res.failed).toBe(1);
    expect(fulfillOrder).not.toHaveBeenCalled();
  });

  it("金额与币种都对时发货，并计入 paid", async () => {
    const order = makeOrder();
    const { db } = makeDb([order]);
    vi.mocked(paypalCaptureOrder).mockResolvedValue(captureResult() as never);

    const res = await reconcilePaypalOrders(makeEnv(db));

    expect(res).toEqual({ scanned: 1, paid: 1, failed: 0 });
    expect(fulfillOrder).toHaveBeenCalledWith(expect.anything(), order, "CAP-1");
  });

  it("ORDER_ALREADY_CAPTURED 时把已有扣款查回来补发货", async () => {
    const { db } = makeDb([makeOrder()]);
    vi.mocked(paypalCaptureOrder).mockRejectedValue(
      new PaypalCaptureError("ORDER_ALREADY_CAPTURED", "已经扣过款")
    );
    vi.mocked(paypalRetrieveCaptures).mockResolvedValue(captureResult({ captureId: "CAP-9" }) as never);

    const res = await reconcilePaypalOrders(makeEnv(db));

    expect(paypalRetrieveCaptures).toHaveBeenCalledWith(
      expect.objectContaining({ paypalOrderId: "PAYPAL-1" })
    );
    expect(fulfillOrder).toHaveBeenCalledWith(expect.anything(), expect.anything(), "CAP-9");
    expect(res.paid).toBe(1);
  });

  it("已经发过货的订单不重复计 paid", async () => {
    const { db } = makeDb([makeOrder()]);
    vi.mocked(paypalCaptureOrder).mockResolvedValue(captureResult() as never);
    vi.mocked(fulfillOrder).mockResolvedValue({ alreadyPaid: true });

    const res = await reconcilePaypalOrders(makeEnv(db));

    expect(res.paid).toBe(0);
    expect(res.failed).toBe(0);
  });

  it("单笔异常只记失败，后续订单继续处理", async () => {
    const first = makeOrder({ id: "order-1", transaction_id: "PAYPAL-1" });
    const second = makeOrder({ id: "order-2", transaction_id: "PAYPAL-2" });
    const { db } = makeDb([first, second]);

    vi.mocked(paypalCaptureOrder)
      .mockRejectedValueOnce(new PaypalCaptureError("INTERNAL_SERVER_ERROR", "PayPal 挂了"))
      .mockResolvedValueOnce(captureResult({ captureId: "CAP-2" }) as never);

    const res = await reconcilePaypalOrders(makeEnv(db));

    expect(res).toEqual({ scanned: 2, paid: 1, failed: 1 });
    // 第一单抛错后仍然处理了第二单
    expect(fulfillOrder).toHaveBeenCalledTimes(1);
    expect(fulfillOrder).toHaveBeenCalledWith(expect.anything(), second, "CAP-2");
  });
});
