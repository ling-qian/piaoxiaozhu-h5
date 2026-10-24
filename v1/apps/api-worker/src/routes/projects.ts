/** 项目管理。列表用单条聚合查询，避免「每个项目查三次」的 N+1。 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { ProjectWithAggregates, UserRow } from "../db/types";
import { badRequest, forbidden, isUuid, notFound, requireString } from "../lib/http";
import { effectivePlanCode, getPlan, UNLIMITED } from "../lib/plans";
import { nowIso } from "../lib/time";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

function toResponse(p: ProjectWithAggregates) {
  return {
    id: p.id,
    user_id: p.user_id,
    customer_id: p.customer_id,
    name: p.name,
    industry: p.industry,
    report_month: p.report_month,
    status: p.status,
    created_at: p.created_at,
    record_count: Number(p.record_count ?? 0),
    total_cost: Math.round(Number(p.total_cost ?? 0) * 100) / 100,
    total_income: Math.round(Number(p.total_income ?? 0) * 100) / 100,
  };
}

const AGG_SELECT = `
  SELECT p.*,
         COUNT(r.id) AS record_count,
         COALESCE(SUM(CASE WHEN r.direction = 'out'    THEN r.amount END), 0) AS total_cost,
         COALESCE(SUM(CASE WHEN r.direction = 'income' THEN r.amount END), 0) AS total_income
  FROM projects p
  LEFT JOIN invoice_records r ON r.project_id = p.id
`;

const LIST_SQL = `${AGG_SELECT} WHERE p.user_id = ? GROUP BY p.id`;

// 单条查询用独立的 SQL 常量，不要用字符串替换去改 LIST_SQL：
// 那样很容易拼出两个 WHERE/AND，且改一处会悄悄影响列表查询。
const ONE_SQL = `${AGG_SELECT} WHERE p.user_id = ? AND p.id = ? GROUP BY p.id`;

async function loadOne(db: D1Database, projectId: string, userId: string) {
  const row = await db.prepare(ONE_SQL).bind(userId, projectId).first<ProjectWithAggregates>();
  return row ?? null;
}

router.get("/projects", async (c) => {
  const u = c.get("user");
  const { results } = await c.env.DB.prepare(`${LIST_SQL} ORDER BY p.created_at DESC`)
    .bind(u.id)
    .all<ProjectWithAggregates>();
  const items = (results ?? []).map(toResponse);
  return c.json({ items, total: items.length });
});

router.post("/projects", async (c) => {
  const u = c.get("user");
  const body = await c.req.json<any>().catch(() => ({}));

  const name = requireString(body?.name, "项目名称", 100);
  const industry = body?.industry ? String(body.industry).slice(0, 50) : null;
  const reportMonth = body?.report_month ? String(body.report_month).slice(0, 20) : null;
  const customerId = body?.customer_id ?? null;

  if (customerId && !isUuid(String(customerId))) throw badRequest("customer_id 格式不正确");

  const plan = getPlan(effectivePlanCode(u.plan_code, u.plan_expires_at));
  if (plan.projectLimit !== UNLIMITED) {
    const cnt = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?")
      .bind(u.id)
      .first<{ n: number }>();
    if (Number(cnt?.n ?? 0) >= plan.projectLimit) {
      throw forbidden(`当前套餐最多创建 ${plan.projectLimit} 个项目，升级后可增加`);
    }
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO projects (id, user_id, customer_id, name, industry, report_month, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`
  )
    .bind(id, u.id, customerId, name, industry, reportMonth, nowIso())
    .run();

  const created = await loadOne(c.env.DB, id, u.id);
  if (!created) throw notFound("Project not found");
  return c.json(toResponse(created), 201);
});

router.get("/projects/:id", async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id)) throw notFound("Project not found");
  const row = await loadOne(c.env.DB, id, u.id);
  if (!row) throw notFound("Project not found");
  return c.json(toResponse(row));
});

router.delete("/projects/:id", async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id)) throw notFound("Project not found");

  const row = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(id, u.id)
    .first<{ id: string }>();
  if (!row) throw notFound("Project not found");

  // 记录与文件靠外键 ON DELETE CASCADE 一并清理（schema.sql 已声明）
  await c.env.DB.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?")
    .bind(id, u.id)
    .run();
  return c.body(null, 204);
});

export default router;

/** 记录响应字段（与 /api/records 返回一致，避免两端形状分叉） */
function toResponseCompat(r: import("../db/types").InvoiceRecordRow) {
  let detail: unknown = null;
  if (r.verify_detail) {
    try {
      detail = JSON.parse(r.verify_detail);
    } catch {
      detail = null;
    }
  }
  return {
    id: r.id,
    project_id: r.project_id,
    file_id: r.file_id,
    user_id: r.user_id,
    direction: r.direction,
    merchant_name: r.merchant_name,
    tax_no: r.tax_no,
    amount: r.amount === null ? null : Number(r.amount),
    tax_amount: r.tax_amount === null ? null : Number(r.tax_amount),
    invoice_date: r.invoice_date,
    invoice_code: r.invoice_code,
    invoice_no: r.invoice_no,
    category_code: r.category_code,
    category_l1: r.category_l1,
    category_l2: r.category_l2,
    confidence: r.confidence === null ? null : Number(r.confidence),
    raw_text: r.raw_text,
    reason: r.reason,
    is_manual_corrected: Boolean(r.is_manual_corrected),
    created_at: r.created_at,
    updated_at: r.updated_at,
    invoice_fingerprint: r.invoice_fingerprint,
    fingerprint_strength: r.fingerprint_strength,
    duplicate_of: r.duplicate_of,
    is_duplicate: Boolean(r.duplicate_of),
    verify_status: r.verify_status,
    verify_detail: detail,
    verify_checked_at: r.verify_checked_at,
  };
}

// --------------------------------------------------------------------------- 月度收入

/**
 * 按月度登记营业收入。
 *
 * H5 的报表页用它补「没有票的收入」——老板知道这个月收了多少钱，
 * 但没有发票可拍。没有这个入口，收入永远是 0，报表没有意义。
 */
router.post("/projects/:id/manual-income", async (c) => {
  const u = c.get("user");
  const projectId = c.req.param("id");
  if (!isUuid(projectId)) throw notFound("Project not found");

  const body = await c.req.json<{ month?: string; amount?: number }>().catch(() => ({}) as any);
  const month = String(body?.month ?? "").trim();
  const amount = Number(body?.amount);

  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest("month 格式应为 YYYY-MM");
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest("amount 必须是正数");
  if (amount > 99_999_999) throw badRequest("金额超出允许范围");

  const owned = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, u.id)
    .first<{ id: string }>();
  if (!owned) throw notFound("Project not found");

  const id = crypto.randomUUID();
  const ts = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO invoice_records (
       id, project_id, file_id, user_id, direction, merchant_name,
       amount, invoice_date, category_code, category_l1, category_l2,
       confidence, reason, is_manual_corrected, created_at, updated_at
     ) VALUES (?, ?, NULL, ?, 'income', ?, ?, ?, 'income', '收入', '营业收入', 1.0, '手动添加收入', 1, ?, ?)`
  )
    .bind(id, projectId, u.id, `${month} 月度收入`, amount, `${month}-01`, ts, ts)
    .run();

  const created = await c.env.DB.prepare("SELECT * FROM invoice_records WHERE id = ?")
    .bind(id)
    .first<import("../db/types").InvoiceRecordRow>();
  return c.json(toResponseCompat(created!), 201);
});
