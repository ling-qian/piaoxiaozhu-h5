"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getProjects() {
  const session = await auth();
  if (!session?.user) return [];

  const userId = session.user.id;
  return prisma.project.findMany({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { records: true } } },
  });
}

export async function createProject(name: string, industry: string = "restaurant") {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;
  const project = await prisma.project.create({
    data: { name, industry, userId },
  });
  revalidatePath("/");
  return project;
}

export async function updateProject(id: string, name: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;
  const project = await prisma.project.update({
    where: { id, userId },
    data: { name },
  });
  revalidatePath("/");
  revalidatePath(`/project/${id}`);
  return project;
}

export async function deleteProject(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;
  // 软删除：设置 deletedAt 而不是物理删除
  await prisma.project.update({
    where: { id, userId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/");
  revalidatePath(`/project/${id}`);
}

/** 根据 ID 获取项目（含已删除的） */
export async function getProjectById(id: string, userId: string) {
  return prisma.project.findFirst({
    where: { id, userId },
  });
}

export async function getProjectStats(projectId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) throw new Error("项目不存在");

  const records = await prisma.record.findMany({
    where: { projectId },
  });

  const totalIncome = records
    .filter((r) => r.direction === "income")
    .reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0);
  const totalExpense = records
    .filter((r) => r.direction === "out")
    .reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0);

  // 按分类汇总支出
  const categoryMap = new Map<string, { code: string; name: string; amount: number }>();
  for (const r of records.filter((r) => r.direction === "out")) {
    const code = r.categoryCode || "other";
    const existing = categoryMap.get(code);
    const amount = Math.round(Number(r.amount) * 100);
    if (existing) {
      existing.amount += amount;
    } else {
      categoryMap.set(code, { code, name: r.categoryL1 || code, amount });
    }
  }
  const costByCategory = Array.from(categoryMap.values())
    .map((c) => ({ ...c, amount: c.amount / 100 }))
    .sort((a, b) => b.amount - a.amount);

  return {
    projectName: project.name,
    recordCount: records.length,
    totalIncome: totalIncome / 100,
    totalExpense: totalExpense / 100,
    grossProfit: (totalIncome - totalExpense) / 100,
    costByCategory,
  };
}
