/**
 * 营业额与毛利。
 *
 * 每天一行，同一天覆盖写。支出不在这里存：它来自票据记录，
 * 存两份就会出现「票据改了、营业额页还是旧毛利」这种对不上的情况。
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { badRequest, isUuid, notFound } from "../lib/http";
import { isDateKey, isMonthKey, normalizeSaleAmount, summarizeSales } from "../lib/sales";
import { nowIso } from "../lib/time";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

async function assertProject(db: D1Database, projectId: string, userId: string) {
  const row = await db
    .prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, userId)
    .first<{ id: string }>();
  if (!row) throw notFound("Project not found");
}

/** 默认月份用 UTC：服务端不知道用户在哪个时区，取整月不偏不倚 */
function resolveMonth(raw: string | undefined | null): string {
  if (!raw) return new Date().toISOString().slice(0, 7);
  if (!isMonthKey(raw)) throw badRequest("month 格式应为 YYYY-MM");
  return raw;
}

router.get("/projects/:projectId/sales", async (c) => {
  const u = c.get("user");
  const projectId = c.req.param("projectId");
  if (!isUuid(projectId)) throw notFound("Project not found");
  await assertProject(c.env.DB, projectId, u.id);

  const month = resolveMonth(c.req.query("month"));

  const { results } = await c.env.DB.prepare(
    `SELECT sale_date, amount, note, updated_at FROM daily_sales
     WHERE project_id = ? AND user_id = ? AND substr(sale_date, 1, 7) = ?
     ORDER BY sale_date DESC`
  )
    .bind(projectId, u.id, month)
    .all<{ sale_date: string; amount: number; note: string | null; updated_at: string }>();

  // 支出走票据表，不落第二份：票据被改，毛利跟着变才是对的
  const expense = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS expense FROM invoice_records
     WHERE project_id = ? AND user_id = ? AND direction = 'out' AND substr(invoice_date, 1, 7) = ?`
  )
    .bind(projectId, u.id, month)
    .first<{ expense: number }>();

  const days = (results ?? []).map((r) => ({
    date: r.sale_date,
    amount: Number(r.amount),
    note: r.note,
    updated_at: r.updated_at,
  }));

  return c.json({
    month,
    days,
    summary: summarizeSales(
      days.map((d) => ({ sale_date: d.date, amount: d.amount })),
      Number(expense?.expense ?? 0),
      month
    ),
  });
});

router.post("/projects/:projectId/sales", async (c) => {
  const u = c.get("user");
  const projectId = c.req.param("projectId");
  if (!isUuid(projectId)) throw notFound("Project not found");
  await assertProject(c.env.DB, projectId, u.id);

  const body = await c.req.json<any>().catch(() => ({}));

  const date = String(body?.date ?? "");
  if (!isDateKey(date)) throw badRequest("日期格式应为 YYYY-MM-DD");

  const amount = normalizeSaleAmount(body?.amount);
  if (amount === null) throw badRequest("营业额不合法：需要 0 到 9999999999.99 之间的数字");

  const note =
    body?.note === null || body?.note === undefined ? null : String(body.note).slice(0, 200);
  const ts = nowIso();

  // 同一天重复提交覆盖原值。靠唯一索引保证：「改今天的数字」不该变成多一条。
  await c.env.DB.prepare(
    `INSERT INTO daily_sales (id, user_id, project_id, sale_date, amount, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, sale_date) DO UPDATE SET
       amount = excluded.amount,
       note = excluded.note,
       updated_at = excluded.updated_at`
  )
    .bind(crypto.randomUUID(), u.id, projectId, date, amount, note, ts, ts)
    .run();

  return c.json({ date, amount, note, action: "saved" }, 201);
});

export default router;
