/**
 * 票据记录：列表（含筛选/分页）、创建（含查重与票面自检）、详情、删除。
 *
 * 创建逻辑必须与旧后端一致，否则历史数据与新增数据的查重口径会分叉。
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { InvoiceRecordRow, UserRow } from "../db/types";
import { badRequest, isUuid, notFound, paymentRequired } from "../lib/http";
import { checkInvoice, deriveVerdict } from "../lib/invoice-check";
import { normalizeBatchLines } from "../lib/bill-lines";
import { COST_INVOICE_OCR, consumePoints } from "../lib/points";
import { invoiceFingerprint } from "../lib/invoice-identity";
import { nowIso } from "../lib/time";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function toPayload(r: InvoiceRecordRow) {
  let detail: unknown = null;
  if (r.verify_detail) {
    try {
      detail = JSON.parse(r.verify_detail);
    } catch {
      // 数据被外部改动过时退化为 null，而不是抛 500
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
    // 旧数据加列时默认 1，所以这里兜底成 1 而不是 null
    line_no: r.line_no ?? 1,
  };
}

router.get("/projects/:projectId/records", async (c) => {
  const u = c.get("user");
  const projectId = c.req.param("projectId");
  if (!isUuid(projectId)) throw notFound("Project not found");

  const owned = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, u.id)
    .first<{ id: string }>();
  if (!owned) throw notFound("Project not found");

  const q = c.req.query();
  const where: string[] = ["project_id = ?"];
  const args: unknown[] = [projectId];

  if (q.direction) {
    where.push("direction = ?");
    args.push(q.direction);
  }
  if (q.category_code) {
    where.push("category_code = ?");
    args.push(q.category_code);
  }
  if (q.category_l1) {
    where.push("category_l1 = ?");
    args.push(q.category_l1);
  }
  // 日期范围：H5 的「按月筛选」靠它。用 >= / <= 字符串比较，
  // 因为 invoice_date 存的是定长 YYYY-MM-DD。
  if (q.start && /^\d{4}-\d{2}-\d{2}$/.test(q.start)) {
    where.push("invoice_date >= ?");
    args.push(q.start);
  }
  if (q.end && /^\d{4}-\d{2}-\d{2}$/.test(q.end)) {
    where.push("invoice_date <= ?");
    args.push(q.end);
  }
  if (q.keyword && q.keyword.trim()) {
    // 关键词同时匹配商户名与一级分类（与旧后端一致）
    where.push("(merchant_name LIKE ? OR category_l1 LIKE ?)");
    const kw = `%${q.keyword.trim()}%`;
    args.push(kw, kw);
  }

  const size = Math.min(Math.max(Number(q.size ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(Number(q.page ?? 1) || 1, 1);
  const offset = (page - 1) * size;

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM invoice_records ${whereSql}`
  )
    .bind(...args)
    .first<{ n: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM invoice_records ${whereSql}
     ORDER BY COALESCE(invoice_date, substr(created_at, 1, 10)) DESC, created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...args, size, offset)
    .all<InvoiceRecordRow>();

  return c.json({
    items: (results ?? []).map(toPayload),
    total: Number(totalRow?.n ?? 0),
    page,
    size,
  });
});

router.post("/records", async (c) => {
  const u = c.get("user");
  const body = await c.req.json<any>().catch(() => ({}));

  const projectId = String(body?.project_id ?? "");
  if (!isUuid(projectId)) throw notFound("Project not found");

  const owned = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, u.id)
    .first<{ id: string }>();
  if (!owned) throw notFound("Project not found");

  const direction = String(body?.direction ?? "");
  if (direction !== "out" && direction !== "income") {
    throw badRequest('direction 只能是 "out" 或 "income"');
  }

  const amount = body?.amount === null || body?.amount === undefined ? null : Number(body.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < -9_999_999_999.99 || amount > 9_999_999_999.99)) {
    throw badRequest("金额超出允许范围");
  }

  // 扣积分：只有带 raw_text（即经过 OCR）的记录才扣 1 分。
  // 手动录入/说一句记账不扣——它们没有消耗识别算力。
  // 扣费点在「确认入库」而不是「识别那一刻」：用户识别后觉得不对、放弃保存，
  // 不该被扣分。
  const fromOcr = Boolean(body?.raw_text);
  if (fromOcr) {
    const charged = await consumePoints(c.env.DB, u.id, COST_INVOICE_OCR, "consume_invoice_ocr", "票据识别", nowIso());
    if (!charged.ok) {
      throw paymentRequired(
        `积分不足：识别一张票据需 ${COST_INVOICE_OCR} 积分，当前 ${charged.balance}。可通过签到或购买套餐获取积分。`
      );
    }
  }

  const id = crypto.randomUUID();
  const ts = nowIso();
  const cents = amount === null ? null : Math.round(amount * 100);

  // 指纹：与旧后端同一算法，否则历史记录查重会失效
  const fp = await invoiceFingerprint({
    invoiceType: body?.invoice_type ?? null,
    invoiceCode: body?.invoice_code ?? null,
    invoiceNo: body?.invoice_no ?? null,
    sellerTaxNo: body?.tax_no ?? null,
    invoiceDate: body?.invoice_date ?? null,
    totalAmountCents: cents,
  });

  // 查重：同一用户下指纹相同即视为重复（只在同用户内比，避免跨用户误判）
  let duplicateOf: string | null = null;
  if (fp) {
    const dup = await c.env.DB.prepare(
      "SELECT id FROM invoice_records WHERE user_id = ? AND invoice_fingerprint = ? LIMIT 1"
    )
      .bind(u.id, fp[0])
      .first<{ id: string }>();
    duplicateOf = dup?.id ?? null;
  }

  // 票面自检
  const checks = checkInvoice({
    invoiceCode: body?.invoice_code ?? null,
    invoiceNo: body?.invoice_no ?? null,
    sellerTaxNo: body?.tax_no ?? null,
    invoiceDate: body?.invoice_date ?? null,
    totalAmountCents: cents,
    taxAmountCents:
      body?.tax_amount === null || body?.tax_amount === undefined
        ? null
        : Math.round(Number(body.tax_amount) * 100),
  });
  const verdict = deriveVerdict(checks);

  await c.env.DB.prepare(
    `INSERT INTO invoice_records (
       id, project_id, file_id, user_id, direction, merchant_name, tax_no,
       amount, tax_amount, invoice_date, invoice_code, invoice_no,
       category_code, category_l1, category_l2, confidence, raw_text, reason,
       is_manual_corrected, created_at, updated_at,
       invoice_fingerprint, fingerprint_strength, duplicate_of,
       verify_status, verify_detail, verify_checked_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?,
               ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      projectId,
      body?.file_id && isUuid(String(body.file_id)) ? String(body.file_id) : null,
      u.id,
      direction,
      body?.merchant_name ?? null,
      body?.tax_no ?? null,
      amount,
      body?.tax_amount ?? null,
      body?.invoice_date ?? null,
      body?.invoice_code ?? null,
      body?.invoice_no ?? null,
      body?.category_code ?? null,
      body?.category_l1 ?? null,
      body?.category_l2 ?? null,
      body?.confidence ?? null,
      body?.raw_text ?? null,
      body?.reason ?? null,
      ts,
      ts,
      fp?.[0] ?? null,
      fp?.[1] ?? null,
      duplicateOf,
      verdict,
      JSON.stringify({ checks }),
      ts
    )
    .run();

  const created = await c.env.DB.prepare("SELECT * FROM invoice_records WHERE id = ?")
    .bind(id)
    .first<InvoiceRecordRow>();
  if (!created) throw notFound("Record not found");
  return c.json({ ...toPayload(created), action: "created" }, 201);
});

/**
 * 批量入账：一张供应商对账单拆出的 N 行一次写入。
 *
 * 与单条入账的三处差异，都是刻意的：
 *   1. 积分按整张账单扣一次，不按行扣——20 行只调了一次识别。
 *   2. 不生成弱指纹。现有算法要「税号 + 日期 + 金额」，同一张账单里
 *      两行金额相同会被误判成重复，宁可放弃跨批查重。
 *   3. 去重改按 (file_id, line_no)：重复提交同一张账单时只补缺失的行。
 */
router.post("/records/batch", async (c) => {
  const u = c.get("user");
  const body = await c.req.json<any>().catch(() => ({}));

  const projectId = String(body?.project_id ?? "");
  if (!isUuid(projectId)) throw notFound("Project not found");

  const owned = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, u.id)
    .first<{ id: string }>();
  if (!owned) throw notFound("Project not found");

  const direction = String(body?.direction ?? "");
  if (direction !== "out" && direction !== "income") {
    throw badRequest('direction 只能是 "out" 或 "income"');
  }

  const fileId = body?.file_id && isUuid(String(body.file_id)) ? String(body.file_id) : null;
  if (fileId) {
    const fileOwned = await c.env.DB.prepare("SELECT id FROM invoice_files WHERE id = ? AND user_id = ?")
      .bind(fileId, u.id)
      .first<{ id: string }>();
    if (!fileOwned) throw notFound("File not found");
  }

  const normalized = normalizeBatchLines(
    {
      merchantName: body?.merchant_name ?? null,
      invoiceDate: body?.invoice_date ?? null,
      taxNo: body?.tax_no ?? null,
    },
    body?.lines
  );

  if (normalized.lines.length === 0) {
    throw badRequest(
      normalized.failed > 0
        ? "所有明细行的金额都无法识别，请手动填写后再提交"
        : "没有可入账的明细行"
    );
  }

  // 已存在的行号：重复提交同一张账单时跳过，不重复扣钱也不重复记账
  const existingLineNos = new Set<number>();
  if (fileId) {
    const { results } = await c.env.DB.prepare(
      "SELECT line_no FROM invoice_records WHERE file_id = ? AND user_id = ?"
    )
      .bind(fileId, u.id)
      .all<{ line_no: number }>();
    for (const r of results ?? []) existingLineNos.add(Number(r.line_no ?? 1));
  }

  const fromOcr = Boolean(body?.raw_text);

  // 先剔掉已存在的行号，再决定要不要扣积分：
  // 整批都是重复时就返回 0 条，不该扣钱。
  const newLines = normalized.lines.filter((l) => !existingLineNos.has(l.lineNo));
  const duplicates = normalized.lines.length - newLines.length;

  if (newLines.length === 0) {
    return c.json({
      created: 0,
      duplicates,
      failed: normalized.failed,
      line_count: normalized.lines.length,
      ids: [],
    });
  }

  if (fromOcr) {
    const charged = await consumePoints(c.env.DB, u.id, COST_INVOICE_OCR, "consume_invoice_ocr", "账单识别", nowIso());
    if (!charged.ok) {
      throw paymentRequired(
        `积分不足：识别一张账单需 ${COST_INVOICE_OCR} 积分，当前 ${charged.balance}。可通过签到或购买套餐获取积分。`
      );
    }
  }

  const ts = nowIso();
  const ids: string[] = [];
  const statements: D1PreparedStatement[] = [];

  for (const line of newLines) {
    const id = crypto.randomUUID();
    ids.push(id);

    // 行上有发票号才做指纹；对账单通常没有，这一步留空
    const cents = Math.round(line.amount * 100);
    const fp = line.invoiceNo
      ? await invoiceFingerprint({
          invoiceType: null,
          invoiceCode: line.invoiceCode,
          invoiceNo: line.invoiceNo,
          sellerTaxNo: line.taxNo,
          invoiceDate: line.invoiceDate,
          totalAmountCents: cents,
        })
      : null;

    const checks = checkInvoice({
      invoiceCode: line.invoiceCode,
      invoiceNo: line.invoiceNo,
      sellerTaxNo: line.taxNo,
      invoiceDate: line.invoiceDate,
      totalAmountCents: cents,
      taxAmountCents: line.taxAmount === null ? null : Math.round(line.taxAmount * 100),
    });
    const verdict = deriveVerdict(checks);

    statements.push(
      c.env.DB.prepare(
        `INSERT INTO invoice_records (
           id, project_id, file_id, user_id, direction, merchant_name, tax_no,
           amount, tax_amount, invoice_date, invoice_code, invoice_no,
           category_code, category_l1, category_l2, confidence, raw_text, reason,
           is_manual_corrected, created_at, updated_at,
           invoice_fingerprint, fingerprint_strength, duplicate_of,
           verify_status, verify_detail, verify_checked_at, line_no
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?,
                   ?, ?, NULL, ?, ?, ?, ?)`
      ).bind(
        id,
        projectId,
        fileId,
        u.id,
        direction,
        line.merchantName,
        line.taxNo,
        line.amount,
        line.taxAmount,
        line.invoiceDate,
        line.invoiceCode,
        line.invoiceNo,
        line.categoryCode,
        line.categoryL1,
        line.categoryL2,
        line.confidence,
        // 原始文字只挂在第一行，避免 20 行各存一份同样的全文
        body?.raw_text && ids.length === 1 ? String(body.raw_text) : null,
        line.description,
        ts,
        ts,
        fp?.[0] ?? null,
        fp?.[1] ?? null,
        verdict,
        JSON.stringify({ checks }),
        ts,
        line.lineNo
      )
    );
  }

  if (statements.length > 0) await c.env.DB.batch(statements);

  return c.json(
    {
      created: ids.length,
      duplicates,
      failed: normalized.failed,
      line_count: normalized.lines.length,
      ids,
    },
    201
  );
});

router.patch("/records/:id", async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id)) throw notFound("Record not found");

  const existing = await c.env.DB.prepare("SELECT * FROM invoice_records WHERE id = ? AND user_id = ?")
    .bind(id, u.id)
    .first<InvoiceRecordRow>();
  if (!existing) throw notFound("Record not found");

  const body = await c.req.json<any>().catch(() => ({}));
  const fields: Array<[string, unknown]> = [
    ["direction", body?.direction],
    ["merchant_name", body?.merchant_name],
    ["tax_no", body?.tax_no],
    ["amount", body?.amount],
    ["tax_amount", body?.tax_amount],
    ["invoice_date", body?.invoice_date],
    ["invoice_code", body?.invoice_code],
    ["invoice_no", body?.invoice_no],
    ["category_code", body?.category_code],
    ["category_l1", body?.category_l1],
    ["category_l2", body?.category_l2],
    ["confidence", body?.confidence],
    ["raw_text", body?.raw_text],
    ["reason", body?.reason],
  ];

  const sets: string[] = [];
  const args: unknown[] = [];
  for (const [col, val] of fields) {
    if (val === undefined) continue;
    if (val === null) {
      sets.push(`${col} = NULL`);
      continue;
    }
    sets.push(`${col} = ?`);
    args.push(val);
  }

  if (sets.length === 0) throw badRequest("没有要更新的字段");

  sets.push("is_manual_corrected = 1");
  sets.push("updated_at = ?");
  args.push(nowIso());

  await c.env.DB.prepare(`UPDATE invoice_records SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...args, id)
    .run();

  // 金额/号码变了必须重算指纹：否则改过的记录带着旧指纹，
  // 之后同一张票再传进来，查重就会失效（改过的金额永远发现不了重复）。
  if (body?.amount !== undefined || body?.invoice_no !== undefined) {
    const fp = await invoiceFingerprint({
      invoiceType: null,
      invoiceCode: body?.invoice_code ?? existing.invoice_code,
      invoiceNo: body?.invoice_no ?? existing.invoice_no,
      sellerTaxNo: body?.tax_no ?? existing.tax_no,
      invoiceDate: body?.invoice_date ?? existing.invoice_date,
      totalAmountCents: existing.amount === null ? null : Math.round(existing.amount * 100),
    });
    await c.env.DB.prepare(
      "UPDATE invoice_records SET invoice_fingerprint = ?, fingerprint_strength = ?, duplicate_of = NULL WHERE id = ?"
    )
      .bind(fp?.[0] ?? null, fp?.[1] ?? null, id)
      .run();
  }

  const fresh = await c.env.DB.prepare("SELECT * FROM invoice_records WHERE id = ?")
    .bind(id)
    .first<InvoiceRecordRow>();
  if (!fresh) throw notFound("Record not found");
  return c.json(toPayload(fresh));
})

router.get("/records/:id", async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id)) throw notFound("Record not found");
  const row = await c.env.DB.prepare("SELECT * FROM invoice_records WHERE id = ? AND user_id = ?")
    .bind(id, u.id)
    .first<InvoiceRecordRow>();
  if (!row) throw notFound("Record not found");
  return c.json(toPayload(row));
});

router.delete("/records/:id", async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id)) throw notFound("Record not found");
  const row = await c.env.DB.prepare("SELECT id FROM invoice_records WHERE id = ? AND user_id = ?")
    .bind(id, u.id)
    .first<{ id: string }>();
  if (!row) throw notFound("Record not found");
  await c.env.DB.prepare("DELETE FROM invoice_records WHERE id = ? AND user_id = ?")
    .bind(id, u.id)
    .run();
  return c.body(null, 204);
});

export default router;
