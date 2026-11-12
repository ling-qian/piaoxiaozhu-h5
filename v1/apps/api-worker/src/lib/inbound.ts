/**
 * 邮件收票：用户把票据照片作为附件发到自己的专属地址，直接进最近的项目。
 *
 * 为什么要做这件事：注册、装应用、找上传按钮，每一步都在劝退。
 * 用户手上已经有票的时候，最省事的动作是「转发」。
 *
 * 三条边界：
 *   1. 只认图片附件（JPG/PNG/WebP/HEIC）。PDF 发票需要拆页渲染，先不做，
 *      收到 PDF 时静默跳过——宁可少收，也不要把解析不了的字节写进账里。
 *   2. 一封信最多处理 5 张，单张不超过 15MB。收票地址在邮件里传来传去，
 *      不设上限就等于把识别预算交给陌生人。
 *   3. 识别成功且入库才扣积分。识别失败不扣，与站内「确认入库才扣」一致。
 */
import PostalMime from "postal-mime";

import type { Env } from "../env";
import type { UserRow } from "../db/types";
import { cosPresignGet, cosPresignPut, cosPublicUrl } from "./cos";
import { checkInvoice, deriveVerdict } from "./invoice-check";
import { invoiceFingerprint } from "./invoice-identity";
import type { Locale } from "./locale";
import { recognize } from "./ocr";
import { COST_INVOICE_OCR, consumePoints } from "./points";
import { nowIso } from "./time";

const MAX_ATTACHMENTS = 5;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

function localeOf(env: Env): Locale {
  return env.REGION === "cn" ? "zh" : "en";
}

function extensionOf(filename: string, contentType: string): string | null {
  const byMime = IMAGE_TYPES[contentType.toLowerCase().trim()];
  if (byMime) return byMime;

  const dot = (filename || "").lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  if ([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return null;
}

/** 落一个文件到对象存储并登记。存储未配置或上传失败时返回 null，但票据仍可入库 */
async function storeFile(
  env: Env,
  user: UserRow,
  projectId: string,
  bytes: ArrayBuffer,
  ext: string
): Promise<{ id: string; key: string; viewUrl: string } | null> {
  const { COS_BUCKET_NAME, COS_REGION, COS_SECRET_ID, COS_SECRET_KEY } = env;
  if (!COS_BUCKET_NAME || !COS_REGION || !COS_SECRET_ID || !COS_SECRET_KEY) return null;

  const id = crypto.randomUUID();
  const key = `uploads/${user.id}/${projectId}/${id}${ext}`;
  const common = {
    bucket: COS_BUCKET_NAME,
    region: COS_REGION,
    secretId: COS_SECRET_ID,
    secretKey: COS_SECRET_KEY,
    key,
  };

  const putUrl = await cosPresignPut({ ...common, expires: 600 });
  const put = await fetch(putUrl, { method: "PUT", body: bytes });
  if (!put.ok) {
    console.error("[inbound] 上传失败:", put.status, (await put.text()).slice(0, 120));
    return null;
  }

  await env.DB.prepare(
    `INSERT INTO invoice_files
       (id, project_id, user_id, file_url, file_key, source, ocr_status, parse_status, created_at, file_hash, content_kind)
     VALUES (?, ?, ?, ?, ?, 'email', 'pending', 'pending', ?, NULL, 'image')`
  )
    .bind(id, projectId, user.id, cosPublicUrl(COS_BUCKET_NAME, COS_REGION, key), key, nowIso())
    .run();

  return { id, key, viewUrl: await cosPresignGet({ ...common, expires: 3600 }) };
}

/**
 * 处理一张票据图片：识别 → 扣分 → 入库。
 *
 * 返回 `skipped` 时调用方不需要重试；`failed` 才值得记日志追查。
 */
export async function ingestReceiptImage(
  env: Env,
  user: UserRow,
  projectId: string,
  bytes: ArrayBuffer,
  filename: string,
  contentType: string
): Promise<{ status: "created" | "skipped" | "failed"; recordId?: string }> {
  const ext = extensionOf(filename, contentType);
  if (!ext) {
    console.warn("[inbound] 跳过非图片附件:", filename, contentType);
    return { status: "skipped" };
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    console.warn("[inbound] 附件大小不合法:", filename, bytes.byteLength);
    return { status: "skipped" };
  }

  const res = await recognize(bytes, env, 60_000, localeOf(env));
  if (!res.ok || !res.data) {
    console.error("[inbound] 识别失败:", filename, res.failure, res.message);
    return { status: "failed" };
  }

  const charged = await consumePoints(
    env.DB,
    user.id,
    COST_INVOICE_OCR,
    "consume_invoice_ocr",
    "邮件收票",
    nowIso()
  );
  if (!charged.ok) {
    console.warn("[inbound] 积分不足，未入库:", user.id);
    return { status: "skipped" };
  }

  const d = res.data;
  const file = await storeFile(env, user, projectId, bytes, ext);

  const id = crypto.randomUUID();
  const ts = nowIso();
  const cents = d.amount === null ? null : Math.round(d.amount * 100);

  const fp = await invoiceFingerprint({
    invoiceType: null,
    invoiceCode: d.invoiceCode,
    invoiceNo: d.invoiceNo,
    sellerTaxNo: d.taxNo,
    invoiceDate: d.invoiceDate,
    totalAmountCents: cents,
  });

  let duplicateOf: string | null = null;
  if (fp) {
    const dup = await env.DB.prepare(
      "SELECT id FROM invoice_records WHERE user_id = ? AND invoice_fingerprint = ? LIMIT 1"
    )
      .bind(user.id, fp[0])
      .first<{ id: string }>();
    duplicateOf = dup?.id ?? null;
  }

  const checks = checkInvoice({
    invoiceCode: d.invoiceCode,
    invoiceNo: d.invoiceNo,
    sellerTaxNo: d.taxNo,
    invoiceDate: d.invoiceDate,
    totalAmountCents: cents,
    taxAmountCents: d.taxAmount === null ? null : Math.round(d.taxAmount * 100),
  });
  const verdict = deriveVerdict(checks);

  const note = d.invoiceWarning ?? d.category?.reason ?? null;

  await env.DB.prepare(
    `INSERT INTO invoice_records (
       id, project_id, file_id, user_id, direction, merchant_name, tax_no,
       amount, tax_amount, invoice_date, invoice_code, invoice_no,
       category_code, category_l1, category_l2, confidence, raw_text, reason,
       is_manual_corrected, created_at, updated_at,
       invoice_fingerprint, fingerprint_strength, duplicate_of,
       verify_status, verify_detail, verify_checked_at
     ) VALUES (?, ?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      projectId,
      file?.id ?? null,
      user.id,
      d.merchantName,
      d.taxNo,
      d.amount,
      d.taxAmount,
      d.invoiceDate,
      d.invoiceCode,
      d.invoiceNo,
      d.category?.code ?? null,
      d.category?.l1 ?? null,
      d.category?.l2 ?? null,
      d.ocrConfidence,
      d.rawText,
      note,
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

  if (file) {
    await env.DB.prepare("UPDATE invoice_files SET ocr_status = 'done' WHERE id = ?")
      .bind(file.id)
      .run();
  }

  return { status: "created", recordId: id };
}

/** 找用户最近的项目；一个项目都没有就建一个，否则收来的票无处安放 */
export async function resolveProjectId(env: Env, user: UserRow): Promise<string> {
  const existing = await env.DB.prepare(
    "SELECT id FROM projects WHERE user_id = ? AND status != 'deleted' ORDER BY created_at DESC LIMIT 1"
  )
    .bind(user.id)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  const isCn = env.REGION === "cn";
  await env.DB.prepare(
    `INSERT INTO projects (id, user_id, name, currency, status, created_at)
     VALUES (?, ?, ?, ?, 'draft', ?)`
  )
    .bind(id, user.id, isCn ? "邮件收票" : "Email receipts", isCn ? "CNY" : "USD", nowIso())
    .run();
  return id;
}

/**
 * Email Routing 的入口。
 *
 * 地址格式 `r-<token>@<INBOX_DOMAIN>`。token 认不出就退信：
 * catch-all 会让主域的普通地址也走到这里，静默丢弃等于把那些信吞掉。
 */
export async function handleInboundEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const to = (message.to ?? "").trim().toLowerCase();
  const match = /^r-([0-9a-f]{16,64})@/.exec(to);
  if (!match) {
    // catch-all 覆盖整个域，主域的普通地址也会进来。这里退信而不是丢弃：
    // 丢弃会让发信人以为信已送达，而主域以前根本没有 MX，退信才是原来的行为。
    console.warn("[inbound] 收件地址格式不认:", to);
    message.setReject("No such recipient");
    return;
  }

  const user = await env.DB.prepare("SELECT * FROM users WHERE inbox_token = ?")
    .bind(match[1])
    .first<UserRow>();
  if (!user) {
    console.warn("[inbound] token 没有对应账号:", to);
    message.setReject("No such recipient");
    return;
  }

  let parsed: Awaited<ReturnType<typeof PostalMime.parse>>;
  try {
    parsed = await PostalMime.parse(message.raw);
  } catch (e) {
    console.error("[inbound] MIME 解析失败:", e);
    return;
  }

  const images = (parsed.attachments ?? []).filter((a) =>
    extensionOf(a.filename ?? "", a.mimeType ?? "") !== null
  );
  if (images.length === 0) {
    console.warn("[inbound] 没有可识别的图片附件:", to);
    return;
  }

  const projectId = await resolveProjectId(env, user);
  const limit = Math.min(images.length, MAX_ATTACHMENTS);

  for (const att of images.slice(0, limit)) {
    const bytes =
      att.content instanceof ArrayBuffer
        ? att.content
        : new Uint8Array(att.content as Uint8Array).buffer;
    await ingestReceiptImage(env, user, projectId, bytes as ArrayBuffer, att.filename ?? "", att.mimeType ?? "");
  }

  if (images.length > limit) {
    console.warn(`[inbound] 附件 ${images.length} 张，只处理前 ${limit} 张`);
  }
}
