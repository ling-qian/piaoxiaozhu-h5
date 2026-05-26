"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getProjects() {
  const session = await auth();
  if (!session?.user) return [];

  const userId = (session.user as any).id;
  return prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { records: true } } },
  });
}

export async function createProject(name: string, industry: string = "restaurant") {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = (session.user as any).id;
  const project = await prisma.project.create({
    data: { name, industry, userId },
  });
  revalidatePath("/");
  return project;
}

export async function updateProject(id: string, name: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = (session.user as any).id;
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

  const userId = (session.user as any).id;
  await prisma.project.delete({ where: { id, userId } });
  revalidatePath("/");
}

export async function getProjectStats(projectId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = (session.user as any).id;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) throw new Error("项目不存在");

  const records = await prisma.record.findMany({
    where: { projectId },
  });

  const totalIncome = records
    .filter((r) => r.direction === "income")
    .reduce((sum, r) => sum + Math.round(r.amount * 100), 0);
  const totalExpense = records
    .filter((r) => r.direction === "out")
    .reduce((sum, r) => sum + Math.round(r.amount * 100), 0);

  return {
    recordCount: records.length,
    totalIncome: totalIncome / 100,
    totalExpense: totalExpense / 100,
    grossProfit: (totalIncome - totalExpense) / 100,
  };
}
