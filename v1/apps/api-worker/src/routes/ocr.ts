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
import { getLocale } from "../lib/locale";
import { imageUrlForVision, recognize } from "../lib/ocr";
import { recognizeBillViaLLM } from "../lib/ocr-bill";
import { assertHourlyLimit } from "../lib/rate-limit";

const router = new Hono<{ Bindings: Env; Variables: { user: UserRow } }>();

/** 上限与 OCR 服务侧保持一致（15MB） */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** 两个识别接口共用同一套图片校验，免得只改一边 */
function assertImage(buf: ArrayBuffer, isEn: boolean) {
  if (!buf || buf.byteLength === 0) {
    throw badRequest(isEn ? "The uploaded image is empty" : "图片内容为空");
  }
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw badRequest(
      isEn
        ? `Image exceeds ${MAX_IMAGE_BYTES / 1024 / 1024}MB`
        : `图片超过 ${MAX_IMAGE_BYTES / 1024 / 1024}MB`
    );
  }
}

router.post("/ocr/recognize", async (c) => {
  const locale = getLocale(c);
  const isEn = locale === "en";
  const u = c.get("user");

  // 识别一次就烧一次视觉模型的调用费，而积分在「入账」时才扣。
  // 不设上限的话，一个正常账号就能把预算刷穿。
  await assertHourlyLimit(
    c.env.DB,
    u.id,
    "ocr_recognize",
    60,
    isEn ? "Too many scans. Please wait a while before trying again." : "识别太频繁了，请稍后再试"
  );

  const buf = await c.req.arrayBuffer();
  assertImage(buf, isEn);

  const res = await recognize(buf, c.env, 60_000, locale);

  if (!res.ok) {
    // 503 = 模型加载中或超时，前端可提示「稍后重试」；502 = 服务端异常。
    // 两者对用户的话术不同，不要合并成 500。
    const status = res.failure === "timeout" || res.failure === "no_service" ? 503 : 502;
    throw new ApiError(status, res.message ?? (isEn ? "Recognition failed" : "识别失败"));
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

/**
 * 供应商账单识别：一次出多行。
 *
 * 与上面的小票接口分开，是因为提示词不同、输出体量差一个数量级
 * （60 行 × 4 千 token）。合并成一个接口会让前端拿到形状不定的响应。
 */
router.post("/ocr/recognize-bill", async (c) => {
  const locale = getLocale(c);
  const isEn = locale === "en";
  const u = c.get("user");

  // 单次调用更贵，所以上限比小票通道更严
  await assertHourlyLimit(
    c.env.DB,
    u.id,
    "ocr_bill",
    20,
    isEn ? "Too many statement scans. Please wait a while." : "对账单识别太频繁了，请稍后再试"
  );

  const buf = await c.req.arrayBuffer();
  assertImage(buf, isEn);

  // 账单通道只走视觉模型，不回退到本地 OCR：后者按单张票据设计，
  // 拿不到版式里的多行结构。
  const res = await recognizeBillViaLLM(await imageUrlForVision(buf, c.env), c.env, locale);

  if (!res.ok) {
    const status = res.failure === "timeout" || res.failure === "no_service" ? 503 : 502;
    throw new ApiError(status, res.message ?? (isEn ? "Recognition failed" : "识别失败"));
  }

  const d = res.data;
  return c.json({
    supplier_name: d.supplierName,
    period_start: d.periodStart,
    period_end: d.periodEnd,
    currency: d.currency,
    total_amount: d.totalAmount,
    tax_amount: d.taxAmount,
    is_bill: d.isBill,
    warning: d.warning,
    raw_text: d.rawText,
    lines: d.lines.map((l) => ({
      line_no: l.lineNo,
      description: l.description,
      amount: l.amount,
      tax_amount: l.taxAmount,
      date: l.date,
      category_code: l.categoryCode,
      category_l1: l.categoryL1,
      category_l2: l.categoryL2,
      confidence: l.confidence,
    })),
  });
});

export default router;
