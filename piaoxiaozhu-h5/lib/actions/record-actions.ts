"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { extractFields } from "@/lib/extract-fields";
import { categorize } from "@/lib/categorize";
import { PAGE_SIZE } from "@/lib/constants";

export async function createRecordFromOcr(
  projectId: string,
  rawText: string,
  imageFile: File | null
) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = (session.user as any).id;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) throw new Error("项目不存在");

  const fields = extractFields(rawText);
  const cat = categorize(fields.merchantName, rawText, project.industry);

  let imageUrl: string | null = null;
  if (imageFile) {
    const blob = await put(`receipts/${Date.now()}-${imageFile.name}`, imageFile, {
      access: "public",
    });
    imageUrl = blob.url;
  }

  const record = await prisma.record.create({
    data: {
      projectId,
      userId,
      direction: "out",
      merchantName: fields.merchantName,
      amount: fields.totalAmount || 0,
      taxAmount: fields.taxAmount,
      invoiceDate: fields.invoiceDate,
      invoiceType: fields.invoiceType,
      categoryCode: cat.categoryCode,
      categoryL1: cat.categoryL1,
      categoryL2: cat.categoryL2,
      confidence: cat.confidence,
      reason: cat.reason,
      rawText,
      imageUrl,
    },
  });

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/report/${projectId}`);
  return record;
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

  const userId = (session.user as any).id;

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
  return record;
}

export async function getRecords(
  projectId: string,
  cursor?: string,
  month?: string,
  category?: string
) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = (session.user as any).id;

  const where: any = { projectId, userId };
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

  return { items, nextCursor, hasMore };
}

export async function getRecord(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = (session.user as any).id;
  return prisma.record.findFirst({ where: { id, userId } });
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

  const userId = (session.user as any).id;
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
  return record;
}

export async function deleteRecord(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = (session.user as any).id;
  const existing = await prisma.record.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("记录不存在");

  await prisma.record.delete({ where: { id } });
  revalidatePath(`/project/${existing.projectId}`);
  revalidatePath(`/report/${existing.projectId}`);
}

export async function getRecordsForReport(projectId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = (session.user as any).id;
  return prisma.record.findMany({
    where: { projectId, userId },
    orderBy: { invoiceDate: "desc" },
  });
}
