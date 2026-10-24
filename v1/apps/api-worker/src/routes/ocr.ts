/**
 * OCR 接口：把图片转给 OCR 服务，返回可编辑的字段草稿。
 *
 * **不直接入库**。用户要能看到识别结果、必要时改金额，再点保存。
 * 识别错了却已经写进账里，比识别失败严重得多。
 */
import { Hono } from "hono";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { ApiError, badRequest } from "../lib/http";
import { recognize } from "../lib/ocr";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

/** 上限与 OCR 服务侧保持一致（15MB） */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

router.post("/ocr/recognize", async (c) => {
  const buf = await c.req.arrayBuffer();
  if (!buf || buf.byteLength === 0) throw badRequest("图片内容为空");
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw badRequest(`图片超过 ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
  }

  const res = await recognize(buf, c.env.OCR_SERVICE_URL);

  if (!res.ok) {
    // 503 = 模型加载中或超时，前端可提示「稍后重试」；502 = 服务端异常。
    // 两者对用户的话术不同，不要合并成 500。
    const status = res.failure === "timeout" || res.failure === "no_service" ? 503 : 502;
    throw new ApiError(status, res.message ?? "识别失败");
  }

  const d = res.data!;
  return c.json({
    // 字段名与前端 ParsedEntry / 结果页对齐
    merchant_name: d.merchantName,
    amount: d.amount,
    tax_amount: d.taxAmount,
    invoice_date: d.invoiceDate,
    invoice_code: d.invoiceCode,
    invoice_no: d.invoiceNo,
    tax_no: d.taxNo,
    category_code: d.category?.code ?? null,
    category_l1: d.category?.l1 ?? null,
    category_l2: d.category?.l2 ?? null,
    confidence: d.ocrConfidence,
    raw_text: d.rawText,
    reason: d.invoiceWarning ?? d.category?.reason ?? null,
    // 非票据提示：前端据此在结果页顶部显示黄色警示条
    is_invoice: d.isInvoice,
    invoice_warning: d.invoiceWarning,
    line_check: d.lineCheck,
  });
});

export default router;
