/**
 * 月度会计交付包：汇总、异常清单、明细 CSV、只读分享链接。
 *
 * 分享走 `report_snapshots` 而不是另建一套表：这张表本来就是存
 * 「报表某一版结果 + 分享令牌」的，字段够用，而且令牌唯一索引已经在。
 *
 * 分享链接是快照而不是实时视图。会计看到的数字必须和用户发出去那一刻一致，
 * 否则用户说「这个月支出 8 万」，会计打开却看到 9 万，两个人对不上账。
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { PackRecord } from "../lib/pack";
import { buildPack, isMonthKey, previousMonth, renderPackCsv } from "../lib/pack";
import type { UserRow } from "../db/types";
import { badRequest, isUuid, notFound } from "../lib/http";
import { nowIso } from "../lib/time";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

/** 交付包要的列，不用 SELECT *：正文与文件路径这些字段不参与计算 */
const RECORD_COLUMNS = `id, direction, amount, tax_amount, invoice_date, merchant_name,
  category_l1, category_l2, invoice_no, invoice_code, file_id, reason`;

async function assertProject(db: D1Database, projectId: string, userId: string) {
  const row = await db
    .prepare("SELECT id, name FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, userId)
    .first<{ id: string; name: string }>();
  if (!row) throw notFound("Project not found");
  return row;
}

function resolveMonth(raw: string | undefined | null): string {
  if (!raw) return previousMonth();
  if (!isMonthKey(raw)) throw badRequest("month 格式应为 YYYY-MM");
  return raw;
}

async function loadRecords(db: D1Database, projectId: string, userId: string): Promise<PackRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${RECORD_COLUMNS} FROM invoice_records WHERE project_id = ? AND user_id = ?`)
    .bind(projectId, userId)
    .all<PackRecord>();
  return results ?? [];
}

/** 已有快照时直接复用令牌，用户复制过的链接不会因为再点一次分享就失效 */
async function findSnapshot(db: D1Database, projectId: string, userId: string, month: string) {
  return db
    .prepare(
      `SELECT id, share_token, created_at FROM report_snapshots
       WHERE project_id = ? AND user_id = ? AND summary = ? AND status = 'ready'
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(projectId, userId, month)
    .first<{ id: string; share_token: string | null; created_at: string }>();
}

/**
 * 分享链接带上推荐来源。
 *
 * 用户注册时若带着会计的码，之后他发出去的每一份交付包都继续带这个码。
 * 这样会计把一份样例转发给第二家店时，新注册仍然算在他头上。
 */
async function referralOf(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT partner_code FROM referrals WHERE user_id = ?")
    .bind(userId)
    .first<{ partner_code: string }>();
  return row?.partner_code ?? null;
}

function sharePath(token: string, ref: string | null): string {
  return ref ? `/share/${token}?ref=${encodeURIComponent(ref)}` : `/share/${token}`;
}

router.get("/projects/:projectId/pack", async (c) => {
  const u = c.get("user");
  const projectId = c.req.param("projectId");
  if (!isUuid(projectId)) throw notFound("Project not found");
  const project = await assertProject(c.env.DB, projectId, u.id);

  const month = resolveMonth(c.req.query("month"));
  const records = await loadRecords(c.env.DB, projectId, u.id);
  const pack = buildPack(records, month, nowIso());

  const snapshot = await findSnapshot(c.env.DB, projectId, u.id, month);
  const ref = snapshot?.share_token ? await referralOf(c.env.DB, u.id) : null;
  return c.json({
    ...pack,
    // 交付包抬头要写商户名，会计才知道这是哪家店的账
    project_name: project.name,
    share: snapshot?.share_token
      ? {
          token: snapshot.share_token,
          path: sharePath(snapshot.share_token, ref),
          shared_at: snapshot.created_at,
        }
      : null,
  });
});

router.get("/projects/:projectId/pack/csv", async (c) => {
  const u = c.get("user");
  const projectId = c.req.param("projectId");
  if (!isUuid(projectId)) throw notFound("Project not found");
  await assertProject(c.env.DB, projectId, u.id);

  const month = resolveMonth(c.req.query("month"));
  const csv = renderPackCsv(await loadRecords(c.env.DB, projectId, u.id), month);

  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="pack-${month}.csv"`,
    "Cache-Control": "no-store",
  });
});

router.post("/projects/:projectId/pack/share", async (c) => {
  const u = c.get("user");
  const projectId = c.req.param("projectId");
  if (!isUuid(projectId)) throw notFound("Project not found");
  await assertProject(c.env.DB, projectId, u.id);

  const body = await c.req.json<any>().catch(() => ({}));
  const month = resolveMonth(body?.month);

  const pack = buildPack(await loadRecords(c.env.DB, projectId, u.id), month, nowIso());
  const detail = JSON.stringify(pack);
  const ts = nowIso();

  const ref = await referralOf(c.env.DB, u.id);
  const existing = await findSnapshot(c.env.DB, projectId, u.id, month);
  if (existing?.share_token) {
    await c.env.DB.prepare(
      "UPDATE report_snapshots SET detail_json = ?, created_at = ? WHERE id = ?"
    )
      .bind(detail, ts, existing.id)
      .run();
    return c.json({
      token: existing.share_token,
      path: sharePath(existing.share_token, ref),
      shared_at: ts,
    });
  }

  // 令牌是访问凭据，32 位十六进制足够。不用自增或短码：短码能被枚举，
  // 枚举到就是别人的账目。
  const token = crypto.randomUUID().replace(/-/g, "");
  const id = crypto.randomUUID();
  const versionRow = await c.env.DB.prepare(
    "SELECT MAX(version) AS v FROM report_snapshots WHERE project_id = ?"
  )
    .bind(projectId)
    .first<{ v: number | null }>();
  const version = Number(versionRow?.v ?? 0) + 1;

  await c.env.DB.prepare(
    `INSERT INTO report_snapshots (id, project_id, user_id, version, summary, detail_json, share_token, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?)`
  )
    .bind(id, projectId, u.id, version, month, detail, token, ts)
    .run();

  return c.json({ token, path: sharePath(token, ref), shared_at: ts }, 201);
});

/**
 * 只读分享：不需要登录，凭令牌取快照。
 *
 * 这条路由在入口的鉴权白名单里。返回的是生成时刻的数据，不含用户信息，
 * 也不含水印以外的任何登录态。
 */
router.get("/share/:token", async (c) => {
  const token = c.req.param("token");
  if (!token || token.length < 16) throw notFound("Share link not found");

  const row = await c.env.DB.prepare(
    `SELECT rs.detail_json, rs.created_at, p.name AS project_name
     FROM report_snapshots rs JOIN projects p ON p.id = rs.project_id
     WHERE rs.share_token = ? AND rs.status = 'ready'`
  )
    .bind(token)
    .first<{ detail_json: string | null; created_at: string; project_name: string }>();

  if (!row?.detail_json) throw notFound("Share link not found");

  let pack: unknown;
  try {
    pack = JSON.parse(row.detail_json);
  } catch {
    // 快照被外部写坏了，当作不存在，而不是把半截 JSON 吐给访客
    throw notFound("Share link not found");
  }

  return c.json({ project_name: row.project_name, shared_at: row.created_at, pack });
});

export default router;
