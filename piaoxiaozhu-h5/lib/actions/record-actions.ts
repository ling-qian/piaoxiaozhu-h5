"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { extractFields } from "@/lib/extract-fields";
import { categorizeWithLlm } from "@/lib/categorize";
import { checkQuota, incrementQuotaUsed } from "@/lib/actions/user-actions";
import { PAGE_SIZE } from "@/lib/constants";

// 将 Prisma Record 序列化为纯对象（Decimal → number），避免传给 Client Component 时报错
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeRecord(r: any) {
  return {
    id: r.id,
    projectId: r.projectId,
    userId: r.userId,
    direction: r.direction,
    merchantName: r.merchantName,
    amount: Number(r.amount),
    taxAmount: r.taxAmount ? Number(r.taxAmount) : null,
    amountWithoutTax: r.amountWithoutTax ? Number(r.amountWithoutTax) : null,
    taxRate: r.taxRate ? Number(r.taxRate) : null,
    invoiceDate: r.invoiceDate,
    invoiceType: r.invoiceType,
    invoiceNo: r.invoiceNo,
    invoiceCode: r.invoiceCode,
    checkCode: r.checkCode,
    buyerName: r.buyerName,
    buyerTaxNo: r.buyerTaxNo,
    sellerTaxNo: r.sellerTaxNo,
    items: r.items,
    categoryCode: r.categoryCode,
    categoryL1: r.categoryL1,
    categoryL2: r.categoryL2,
    confidence: r.confidence != null ? Number(r.confidence) : 0,
    reason: r.reason,
    isManualCorrected: r.isManualCorrected,
    rawText: r.rawText,
    imageUrl: r.imageUrl,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function uploadImage(imageFile: File): Promise<string | null> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    console.warn("[uploadImage] BLOB_READ_WRITE_TOKEN 未配置，图片将不会上传");
    return null;
  }

  try {
    const { put } = await import("@vercel/blob");
    const blob = await put(`receipts/${Date.now()}-${imageFile.name}`, imageFile, {
      access: "public",
    });
    return blob.url;
  } catch (err) {
    console.error("[uploadImage] 图片上传失败:", err);
    return null;
  }
}

interface VisionFields {
  merchantName?: string | null;
  totalAmount?: number | null;
  taxAmount?: number | null;
  amountWithoutTax?: number | null;
  taxRate?: number | null;
  invoiceDate?: string | null;
  invoiceType?: string | null;
  invoiceNo?: string | null;
  invoiceCode?: string | null;
  checkCode?: string | null;
  buyerName?: string | null;
  buyerTaxNo?: string | null;
  sellerTaxNo?: string | null;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    taxRate: number;
    taxAmount: number;
  }> | null;
}

export async function createRecordFromOcr(
  projectId: string,
  rawText: string,
  imageFile: File | null,
  visionFields?: VisionFields
) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;

  const quota = await checkQuota();
  if (!quota.available) {
    throw new Error("识别次数已用完，请升级套餐");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) throw new Error("项目不存在");

  // 如果视觉模型提供了结构化字段，优先使用；否则从 rawText 提取
  const extracted = extractFields(rawText);
  const fields = {
    merchantName: visionFields?.merchantName || extracted.merchantName,
    totalAmount: visionFields?.totalAmount ?? extracted.totalAmount,
    taxAmount: visionFields?.taxAmount ?? extracted.taxAmount,
    amountWithoutTax: visionFields?.amountWithoutTax ?? extracted.amountWithoutTax,
    taxRate: visionFields?.taxRate ?? extracted.taxRate,
    invoiceDate: visionFields?.invoiceDate || extracted.invoiceDate,
    invoiceType: visionFields?.invoiceType || extracted.invoiceType,
    invoiceNo: visionFields?.invoiceNo || extracted.invoiceNo,
    invoiceCode: visionFields?.invoiceCode ?? extracted.invoiceCode,
    checkCode: visionFields?.checkCode ?? extracted.checkCode,
    buyerName: visionFields?.buyerName ?? extracted.buyerName,
    buyerTaxNo: visionFields?.buyerTaxNo ?? extracted.buyerTaxNo,
    sellerTaxNo: visionFields?.sellerTaxNo ?? extracted.sellerTaxNo,
    items: visionFields?.items ?? extracted.items,
  };

  const cat = await categorizeWithLlm(fields.merchantName, rawText, project.industry);

  let imageUrl: string | null = null;
  let imageUploadFailed = false;
  if (imageFile) {
    imageUrl = await uploadImage(imageFile);
    if (!imageUrl) imageUploadFailed = true;
  }

  // items 存为 JSON 字符串
  const itemsJson = fields.items && fields.items.length > 0 ? JSON.stringify(fields.items) : null;

  const record = await prisma.record.create({
    data: {
      projectId,
      userId,
      direction: "out",
      merchantName: fields.merchantName,
      amount: fields.totalAmount || 0,
      taxAmount: fields.taxAmount,
      amountWithoutTax: fields.amountWithoutTax,
      taxRate: fields.taxRate,
      invoiceDate: fields.invoiceDate,
      invoiceType: fields.invoiceType,
      invoiceNo: fields.invoiceNo,
      invoiceCode: fields.invoiceCode,
      checkCode: fields.checkCode,
      buyerName: fields.buyerName,
      buyerTaxNo: fields.buyerTaxNo,
      sellerTaxNo: fields.sellerTaxNo,
      items: itemsJson,
      categoryCode: cat.categoryCode,
      categoryL1: cat.categoryL1,
      categoryL2: cat.categoryL2,
      confidence: cat.confidence,
      reason: cat.reason,
      rawText,
      imageUrl,
    },
  });

  await incrementQuotaUsed();

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/report/${projectId}`);

  return {
    ...serializeRecord(record),
    _imageUploadFailed: imageUploadFailed,
  };
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

  const userId = session.user.id;

  // HIGH-2: 验证项目归属当前用户
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) throw new Error("项目不存在或无权限");

  const record = await prisma.record.create({
    data: {
      projectId,
      userId,
      direction: data.direction,
      merchantName: data.merchantName,
      amount: data.amount,
      taxAmount: data.taxAmount,
      invoiceDate: data.invoiceDate,
      categoryCode: data.categoryCode,
      categoryL1: data.categoryL1,
      categoryL2: data.categoryL2,
      confidence: 1.0,
      reason: "手动录入",
      isManualCorrected: true,
    },
  });

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/report/${projectId}`);
  return serializeRecord(record);
}

export async function getRecords(
  projectId: string,
  cursor?: string,
  month?: string,
  category?: string
) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;

  const where: { projectId: string; userId: string; invoiceDate?: { startsWith: string }; categoryCode?: string } = { projectId, userId };
  if (month) {
    where.invoiceDate = { startsWith: month };
  }
  if (category) {
    where.categoryCode = category;
  }

  const records = await prisma.record.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = records.length > PAGE_SIZE;
  const items = hasMore ? records.slice(0, -1) : records;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return {
    items: items.map(serializeRecord),
    nextCursor,
    hasMore,
  };
}

export async function getRecord(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;
  const record = await prisma.record.findFirst({ where: { id, userId } });
  if (!record) return null;
  return serializeRecord(record);
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

  const userId = session.user.id;
  const existing = await prisma.record.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("记录不存在");

  const record = await prisma.record.update({
    where: { id },
    data: {
      ...data,
      isManualCorrected: true,
    },
  });

  revalidatePath(`/project/${existing.projectId}`);
  revalidatePath(`/report/${existing.projectId}`);
  return serializeRecord(record);
}

export async function deleteRecord(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;
  const existing = await prisma.record.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("记录不存在");

  await prisma.record.delete({ where: { id } });
  revalidatePath(`/project/${existing.projectId}`);
  revalidatePath(`/report/${existing.projectId}`);
}

export async function addManualIncome(
  projectId: string,
  month: string,
  amount: number
) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) throw new Error("项目不存在");

  const record = await prisma.record.create({
    data: {
      projectId,
      userId,
      direction: "income",
      merchantName: `${month} 月度收入`,
      amount,
      invoiceDate: `${month}-01`,
      categoryCode: "income",
      categoryL1: "收入",
      categoryL2: "营业收入",
      confidence: 1.0,
      reason: "手动添加收入",
      isManualCorrected: true,
    },
  });

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/report/${projectId}`);
  return serializeRecord(record);
}

export async function getRecordsForReport(projectId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;
  const records = await prisma.record.findMany({
    where: { projectId, userId },
    orderBy: { invoiceDate: "desc" },
  });
  return records.map(serializeRecord);
}
