"use server";

/**
 * 票据记录相关数据操作（已从 Prisma 改为调 Cloudflare Worker 后端）。
 *
 * ## 最重要的一处变化：OCR
 *
 * 原来 H5 在浏览器里跑 Tesseract（WASM），小程序在服务端跑 PaddleOCR。
 * **同一张票在两端可能识别出不同的金额** —— 这是「两端不一致」最严重的一处。
 *
 * 现在 H5 也走后端的 `/api/ocr/recognize`（PaddleOCR），两端用同一套引擎、
 * 同一套字段提取规则。代价是识别要多一次网络往返（约 1–2 秒），
 * 换来的是数字一致 + 手机上不再卡（Tesseract 在低端机上要 5–20 秒）。
 *
 * ## 字段差异
 *
 * 后端的记录表比 H5 原来的窄（没有不含税金额/税率/校验码/购买方/明细/图片）。
 * 这些字段**没有任何页面读取**（已核实），因此不再返回，
 * 但保留为 undefined 以免客户端类型报错。
 */

import { revalidatePath } from "next/cache";

import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@/lib/auth";
import { extractFields } from "@/lib/extract-fields";
import { PAGE_SIZE } from "@/lib/constants";

/** 后端记录对象（/api/records 与 /api/projects/:id/records 返回的形状） */
interface RecordPayload {
  id: string;
  project_id: string;
  file_id: string | null;
  user_id: string;
  direction: string;
  merchant_name: string | null;
  tax_no: string | null;
  amount: number | null;
  tax_amount: number | null;
  invoice_date: string | null;
  invoice_code: string | null;
  invoice_no: string | null;
  category_code: string | null;
  category_l1: string | null;
  category_l2: string | null;
  confidence: number | null;
  raw_text: string | null;
  reason: string | null;
  is_manual_corrected: boolean;
  created_at: string;
  updated_at: string;
  invoice_fingerprint: string | null;
  fingerprint_strength: string | null;
  duplicate_of: string | null;
  is_duplicate: boolean;
  verify_status: string | null;
  verify_detail: unknown;
  verify_checked_at: string | null;
}

/** 序列化成页面用的 camelCase 形状（旧 serializeRecord 的兼容版） */
/**
 * 序列化成页面用的 camelCase 形状。
 *
 * 空值兜底成 "" / 0：页面类型声明的是非空（旧 Prisma 总是返回值），
 * 而后端这些列可为空（小票没有税号是常态）。
 * 在边界处统一兜底，比让每个页面都写 `?? ""` 更不容易漏。
 */
function serializeRecord(r: RecordPayload) {
  return {
    id: r.id,
    projectId: r.project_id,
    fileId: r.file_id,
    userId: r.user_id,
    direction: r.direction,
    merchantName: r.merchant_name ?? "",
    amount: r.amount === null ? 0 : Number(r.amount),
    taxAmount: r.tax_amount === null ? null : Number(r.tax_amount),
    invoiceDate: r.invoice_date ?? "",
    invoiceNo: r.invoice_no,
    invoiceCode: r.invoice_code,
    taxNo: r.tax_no,
    sellerTaxNo: r.tax_no ?? "",
    categoryCode: r.category_code ?? "",
    categoryL1: r.category_l1 ?? "",
    categoryL2: r.category_l2 ?? "",
    confidence: r.confidence === null ? 0 : Number(r.confidence),
    reason: r.reason,
    isManualCorrected: r.is_manual_corrected,
    rawText: r.raw_text,
    isDuplicate: r.is_duplicate,
    verifyStatus: r.verify_status,
    verifyDetail: r.verify_detail,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // 后端记录表没有这些字段；页面不读，占位以保持形状兼容
    // 用 null 而不是 undefined：页面类型是 `number | null`，
    // 传 undefined 在严格模式下会被判为类型不兼容。
    amountWithoutTax: null,
    taxRate: null,
    invoiceType: null,
    checkCode: null,
    buyerName: null,
    buyerTaxNo: null,
    items: null,
    imageUrl: null,
  };
}

/** 调后端 OCR（PaddleOCR），与小程序同一套引擎 */
async function recognizeWithWorker(imageFile: File) {
  const bytes = await imageFile.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error("图片内容为空");
  return apiFetch<{
    merchant_name: string | null;
    amount: number | null;
    tax_amount: number | null;
    invoice_date: string | null;
    invoice_code: string | null;
    invoice_no: string | null;
    tax_no: string | null;
    category_code: string | null;
    category_l1: string | null;
    category_l2: string | null;
    confidence: number | null;
    raw_text: string | null;
    is_invoice: boolean;
    invoice_warning: string | null;
    line_check: unknown;
  }>("/api/ocr/recognize", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    raw: bytes,
  } as any);
}

interface VisionFields {
  merchantName?: string | null;
  totalAmount?: number | null;
  taxAmount?: number | null;
  /** 旧视觉模型的字段：后端记录表没有对应列，这里只接收不落库 */
  amountWithoutTax?: number | null;
  taxRate?: number | null;
  invoiceDate?: string | null;
  invoiceType?: string | null;
  invoiceNo?: string | null;
  invoiceCode?: string | null;
  sellerTaxNo?: string | null;
  checkCode?: string | null;
  buyerName?: string | null;
  buyerTaxNo?: string | null;
  items?: Array<Record<string, unknown>> | null;
}

export async function createRecordFromOcr(
  projectId: string,
  rawText: string,
  imageFile: File | null,
  visionFields?: VisionFields
) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  // 项目归属由后端校验（404 即不存在或不属于本人）
  const project = await apiFetch<{ id: string; name: string }>(`/api/projects/${projectId}`).catch(() => null);
  if (!project) throw new Error("项目不存在");

  // 优先级：外部视觉模型字段 > 后端 OCR > 本地正则兜底
  let fields: {
    merchantName: string | null;
    totalAmount: number | null;
    taxAmount: number | null;
    invoiceDate: string | null;
    invoiceType: string | null;
    invoiceNo: string | null;
    invoiceCode: string | null;
    sellerTaxNo: string | null;
    categoryCode: string | null;
    categoryL1: string | null;
    categoryL2: string | null;
    confidence: number | null;
    rawText: string;
    isInvoice: boolean;
    invoiceWarning: string | null;
  };

  if (imageFile) {
    const ocr = await recognizeWithWorker(imageFile);
    fields = {
      merchantName: ocr.merchant_name,
      totalAmount: ocr.amount,
      taxAmount: ocr.tax_amount,
      invoiceDate: ocr.invoice_date,
      invoiceType: null,
      invoiceNo: ocr.invoice_no,
      invoiceCode: ocr.invoice_code,
      sellerTaxNo: ocr.tax_no,
      categoryCode: ocr.category_code,
      categoryL1: ocr.category_l1,
      categoryL2: ocr.category_l2,
      confidence: ocr.confidence,
      rawText: ocr.raw_text ?? rawText,
      isInvoice: ocr.is_invoice,
      invoiceWarning: ocr.invoice_warning,
    };
  } else {
    // 没有图片时只能吃传进来的文本，用本地正则兜底
    const extracted = extractFields(rawText);
    fields = {
      merchantName: extracted.merchantName,
      totalAmount: extracted.totalAmount,
      taxAmount: extracted.taxAmount,
      invoiceDate: extracted.invoiceDate,
      invoiceType: extracted.invoiceType,
      // 本地正则没有置信度概念，填 null 表示「未知」而不是 0（0 会被当成完全不可信）
      confidence: null,
      invoiceNo: extracted.invoiceNo,
      invoiceCode: extracted.invoiceCode,
      sellerTaxNo: extracted.sellerTaxNo,
      categoryCode: null,
      categoryL1: null,
      categoryL2: null,
      rawText,
      isInvoice: true,
      invoiceWarning: null,
    };
  }

  // 外部视觉模型的字段仍然优先（兼容原有调用方）
  const final = {
    merchant_name: visionFields?.merchantName || fields.merchantName || null,
    amount: visionFields?.totalAmount ?? fields.totalAmount ?? null,
    tax_amount: visionFields?.taxAmount ?? fields.taxAmount ?? null,
    invoice_date: visionFields?.invoiceDate || fields.invoiceDate || null,
    invoice_code: visionFields?.invoiceCode || fields.invoiceCode || null,
    invoice_no: visionFields?.invoiceNo || fields.invoiceNo || null,
    tax_no: visionFields?.sellerTaxNo || fields.sellerTaxNo || null,
    category_code: fields.categoryCode,
    category_l1: fields.categoryL1,
    category_l2: fields.categoryL2,
    confidence: fields.confidence,
    raw_text: fields.rawText,
  };

  try {
    const created = await apiFetch<RecordPayload>("/api/records", {
      method: "POST",
      body: { project_id: projectId, direction: "out", ...final },
    });
    revalidatePath(`/project/${projectId}`);
    revalidatePath(`/report/${projectId}`);
    return serializeRecord(created);
  } catch (e) {
    if (e instanceof ApiError && e.status === 402) throw new Error(e.message);
    throw e;
  }
}

export async function createManualRecord(
  projectId: string,
  data: {
    direction: string;
    merchantName: string;
    amount: number;
    taxAmount?: number;
    invoiceDate?: string;
    categoryCode: string;
    categoryL1: string;
    categoryL2?: string;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const created = await apiFetch<RecordPayload>("/api/records", {
    method: "POST",
    body: {
      project_id: projectId,
      direction: data.direction,
      merchant_name: data.merchantName,
      amount: data.amount,
      tax_amount: data.taxAmount ?? null,
      invoice_date: data.invoiceDate ?? null,
      category_code: data.categoryCode,
      category_l1: data.categoryL1,
      category_l2: data.categoryL2 ?? null,
      reason: "手动录入",
      confidence: 1.0,
    },
  });

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/report/${projectId}`);
  return serializeRecord(created);
}

/**
 * 分页取记录。
 *
 * cursor 语义从「最后一条的 id」改成「页码」——后端是 page/size 分页。
 * 旧调用方传的是 id，这里做一次兼容判断：能解析成数字就当页码，
 * 否则视为第一页（宁可少一页，也不要因为格式变化抛错）。
 */
export async function getRecords(
  projectId: string,
  cursor?: string,
  month?: string,
  category?: string
) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const page = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 1;
  const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    params.set("start", `${month}-01`);
    params.set("end", `${month}-31`);
  }
  if (category) params.set("category_code", category);

  const data = await apiFetch<{
    items: RecordPayload[];
    total: number;
    page: number;
    size: number;
  }>(`/api/projects/${projectId}/records?${params.toString()}`);

  const items = data.items ?? [];
  const hasMore = page * (data.size ?? PAGE_SIZE) < (data.total ?? 0);

  return {
    items: items.map(serializeRecord),
    nextCursor: hasMore ? String(page + 1) : null,
    hasMore,
  };
}

export async function getRecord(id: string) {
  const session = await auth();
  if (!session?.user) return null;

  try {
    const record = await apiFetch<RecordPayload>(`/api/records/${id}`);
    return serializeRecord(record);
  } catch {
    return null;
  }
}

export async function updateRecord(
  id: string,
  data: {
    merchantName?: string;
    amount?: number;
    taxAmount?: number;
    invoiceDate?: string;
    categoryCode?: string;
    categoryL1?: string;
    categoryL2?: string;
    direction?: string;
  }
) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const body: Record<string, unknown> = {};
  if (data.merchantName !== undefined) body.merchant_name = data.merchantName;
  if (data.amount !== undefined) body.amount = data.amount;
  if (data.taxAmount !== undefined) body.tax_amount = data.taxAmount;
  if (data.invoiceDate !== undefined) body.invoice_date = data.invoiceDate;
  if (data.categoryCode !== undefined) body.category_code = data.categoryCode;
  if (data.categoryL1 !== undefined) body.category_l1 = data.categoryL1;
  if (data.categoryL2 !== undefined) body.category_l2 = data.categoryL2;
  if (data.direction !== undefined) body.direction = data.direction;

  const updated = await apiFetch<RecordPayload>(`/api/records/${id}`, { method: "PATCH", body });
  revalidatePath(`/project/${updated.project_id}`);
  revalidatePath(`/report/${updated.project_id}`);
  return serializeRecord(updated);
}

export async function deleteRecord(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const existing = await apiFetch<RecordPayload>(`/api/records/${id}`).catch(() => null);
  if (!existing) throw new Error("记录不存在");

  await apiFetch(`/api/records/${id}`, { method: "DELETE" });
  revalidatePath(`/project/${existing.project_id}`);
  revalidatePath(`/report/${existing.project_id}`);
}

export async function addManualIncome(projectId: string, month: string, amount: number) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const created = await apiFetch<RecordPayload>(`/api/projects/${projectId}/manual-income`, {
    method: "POST",
    body: { month, amount },
  });

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/report/${projectId}`);
  return serializeRecord(created);
}

export async function getRecordsForReport(projectId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  // 报表要全量：分页拉完再聚合（记录量在几百条量级，可接受）
  const all: RecordPayload[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await apiFetch<{
      items: RecordPayload[];
      total: number;
      size: number;
    }>(`/api/projects/${projectId}/records?page=${page}&size=100`);
    all.push(...(data.items ?? []));
    if (!data.items || data.items.length < 100) break;
    if (page * 100 >= (data.total ?? 0)) break;
  }

  return all.map(serializeRecord);
}
