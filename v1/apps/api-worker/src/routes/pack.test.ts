/**
 * 交付包导出的套餐拦截。
 *
 * ## 为什么测这一层
 *
 * `canExport` 是付费权益，但判断散在路由里：确认了项目归属之后才拦。
 * 纯逻辑测试覆盖不到它——`plans.ts` 里 `canExport` 的值一直是对的，
 * 出问题的是路由有没有用它。
 *
 * 所以这里挂真实的 pack 路由，D1 换成内存替身，只断言状态码和
 * 分享令牌有没有生成。免费账号必须被拦在 CSV 与分享之外，
 * 而查看交付包本身要放行——免费用户看不到汇总，就不知道自己在买什么。
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { Env } from "../env";
import { errorHandler } from "../lib/http";
import packRoutes from "./pack";

// ──────────────────────────────────────────── 内存 D1 替身

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function makeDb() {
  const db = {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first() {
              // 项目归属：两个拦截测试都先过这一关
              if (sql.includes("FROM projects")) {
                return { id: PROJECT_ID, name: "Main", currency: "USD" };
              }
              // 已有快照与版本号：测试里都按「还没有」返回
              if (sql.includes("MAX(version)")) return { v: null };
              if (sql.includes("FROM report_snapshots")) return null;
              if (sql.includes("FROM referrals")) return null;
              return null;
            },
            async all() {
              // 本月没有记录，CSV 只剩表头，不影响状态码断言
              if (sql.includes("FROM invoice_records")) return { results: [] };
              return { results: [] };
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return db as unknown as D1Database;
}

// ──────────────────────────────────────────── 测试用的应用与 env

function makeApp(user: Record<string, unknown>) {
  const app = new Hono<{ Bindings: Env; Variables: { user: never } }>();
  app.use("*", async (c, next) => {
    c.set("user", user as never);
    await next();
  });
  app.route("/", packRoutes);
  app.onError(errorHandler);
  return app;
}

const env = { DB: makeDb(), JWT_SECRET: "test" } as unknown as Env;

const user = (plan: string, expires: string | null = null) => ({
  id: "user-1",
  plan_code: plan,
  plan_expires_at: expires,
});

function get(path: string) {
  return makeApp(user("free")).request(path, {}, env);
}

describe("交付包导出的套餐拦截", () => {
  it("免费账号下载 CSV 返回 403，并说明原因", async () => {
    const res = await get(`/projects/${PROJECT_ID}/pack/csv`);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toContain("升级");
  });

  it("免费账号生成分享链接返回 403", async () => {
    const res = await makeApp(user("free")).request(
      `/projects/${PROJECT_ID}/pack/share`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: "2026-10" }) },
      env
    );

    expect(res.status).toBe(403);
  });

  it("专业版下载 CSV 放行", async () => {
    const res = await makeApp(user("pro")).request(`/projects/${PROJECT_ID}/pack/csv`, {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
  });

  it("专业版生成分享链接返回 201 与 32 位令牌", async () => {
    const res = await makeApp(user("pro")).request(
      `/projects/${PROJECT_ID}/pack/share`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: "2026-10" }) },
      env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; path: string };
    expect(body.token).toMatch(/^[0-9a-f]{32}$/);
    expect(body.path).toBe(`/share/${body.token}`);
  });

  it("套餐已过期按免费档处理，同样 403", async () => {
    const res = await makeApp(user("pro", "2020-01-01T00:00:00Z")).request(
      `/projects/${PROJECT_ID}/pack/csv`,
      {},
      env
    );

    expect(res.status).toBe(403);
  });

  it("免费账号仍可查看交付包本身", async () => {
    const res = await makeApp(user("free")).request(`/projects/${PROJECT_ID}/pack`, {}, env);

    expect(res.status).toBe(200);
  });
});
