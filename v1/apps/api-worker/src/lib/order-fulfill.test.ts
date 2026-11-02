/**
 * 发货逻辑的单元测试。
 *
 * ## 为什么值得单独测
 *
 * `fulfillOrder` 决定「付了钱能不能拿到东西」。它有两个失败方向，都会被用户发现：
 *
 * - 少发：付了钱没到账，用户投诉
 * - **多发**：支付商重推回调时重复发积分，用户白嫖
 *
 * 第二种更隐蔽。Stripe 在没收到 200 时会重推最多三天，本地写错一个条件
 * 就会在线上被放大成「签到式刷积分」。
 *
 * ## 测试方式
 *
 * 用一个内存版 D1 替身，只实现这套代码用到的三类语句。不引真实的
 * D1 或 SQLite，因为要验证的是「条件判断对不对」，不是 SQL 方言。
 */

import { describe, expect, it } from "vitest";

import { fulfillOrder, type PayableOrder } from "./order-fulfill";

interface Stored {
  orders: Map<string, { status: string; paid_at: string | null; transaction_id: string | null }>;
  users: Map<string, { plan_code: string; plan_expires_at: string | null; plan_remind_stage: string | null }>;
  logs: { user_id: string; action: string; delta: number }[];
}

/** 内存版 D1：按语句特征分发，够这套代码用 */
function makeDb(seed: { order: PayableOrder; expiresAt?: string | null }) {
  const store: Stored = {
    orders: new Map([
      [seed.order.id, { status: seed.order.status, paid_at: null, transaction_id: null }],
    ]),
    users: new Map([
      [seed.order.user_id, { plan_code: "free", plan_expires_at: seed.expiresAt ?? null, plan_remind_stage: "d3" }],
    ]),
    logs: [],
  };

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("UPDATE orders")) {
                const id = String(args[2]);
                const row = store.orders.get(id);
                // 关键：只有非 paid 的订单才更新，与真实 SQL 的 WHERE status != 'paid' 一致
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
                const row = store.users.get(String(args[2]));
                if (row) {
                  row.plan_code = String(args[0]);
                  row.plan_expires_at = String(args[1]);
                  row.plan_remind_stage = null;
                }
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 1 } };
            },
            async first<T>() {
              if (sql.includes("SELECT plan_expires_at FROM users")) {
                const u = store.users.get(String(args[0]));
                return { plan_expires_at: u?.plan_expires_at ?? null } as T;
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

const baseOrder: PayableOrder = {
  id: "order-1",
  user_id: "user-1",
  plan_code: "pro",
  amount_cents: 399,
  period_months: 1,
  status: "pending",
};

describe("fulfillOrder", () => {
  it("套餐订单：置 paid、发 300 积分、升级套餐", async () => {
    const { db, store } = makeDb({ order: baseOrder });
    const r = await fulfillOrder(db, baseOrder, "txn-1");

    expect(r.alreadyPaid).toBe(false);
    expect(store.orders.get("order-1")!.status).toBe("paid");
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]!.delta).toBe(300);
    expect(store.users.get("user-1")!.plan_code).toBe("pro");
    // 到期日必须被写上，否则读取时按 free 处理，用户等于没买到
    expect(store.users.get("user-1")!.plan_expires_at).not.toBeNull();
  });

  it("同一个订单重复发货只发一次（支付商重推回调）", async () => {
    const { db, store } = makeDb({ order: baseOrder });

    await fulfillOrder(db, baseOrder, "txn-1");
    // 第二次用已经变成 paid 的订单再发一次
    const paidOrder = { ...baseOrder, status: "paid" };
    const r2 = await fulfillOrder(db, paidOrder, "txn-1");

    expect(r2.alreadyPaid).toBe(true);
    expect(store.logs).toHaveLength(1); // 关键：不能变成 2
  });

  it("并发回调：两次都按 pending 传入，也只发一次", async () => {
    const { db, store } = makeDb({ order: baseOrder });

    // 两个回调同时到达，内存里都是 pending —— 真实环境靠 UPDATE 的影响行数判定
    const [a, b] = await Promise.all([
      fulfillOrder(db, baseOrder, "txn-1"),
      fulfillOrder(db, { ...baseOrder }, "txn-1"),
    ]);

    const granted = [a, b].filter((x) => !x.alreadyPaid);
    expect(granted).toHaveLength(1);
    expect(store.logs).toHaveLength(1);
  });

  it("积分包订单：发积分但不改套餐", async () => {
    const pkgOrder: PayableOrder = { ...baseOrder, plan_code: "points_500", amount_cents: 799 };
    const { db, store } = makeDb({ order: pkgOrder });

    await fulfillOrder(db, pkgOrder, "txn-2");

    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]!.delta).toBe(500);
    // 买积分包不能顺带把套餐升了
    expect(store.users.get("user-1")!.plan_code).toBe("free");
  });

  it("未过期的套餐续费：在原到期日上顺延", async () => {
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const { db, store } = makeDb({ order: baseOrder, expiresAt: future });

    await fulfillOrder(db, baseOrder, "txn-3");

    const after = store.users.get("user-1")!.plan_expires_at!;
    // 顺延一个月，不是从今天重算（否则用户买的剩余天数会被吞掉）
    expect(Date.parse(after)).toBeGreaterThan(Date.parse(future));
  });

  it("已过期的套餐续费：从现在起算，不叠加过期时间", async () => {
    const past = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { db, store } = makeDb({ order: baseOrder, expiresAt: past });

    await fulfillOrder(db, baseOrder, "txn-4");

    const after = store.users.get("user-1")!.plan_expires_at!;
    expect(Date.parse(after)).toBeGreaterThan(Date.now());
  });
});
