import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AnalysisClient from "./analysis-client";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const { project: projectId } = await searchParams;
  if (!projectId) redirect("/");

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { planCode: true },
  });

  // 计算汇总数据用于图表（有记录即计算，不依赖是否已分析）
  let summary = null;
  const records = await prisma.record.findMany({
    where: { projectId, userId: session.user.id },
    orderBy: { invoiceDate: "desc" },
  });

  if (records.length > 0) {
    const totalIncome = records
      .filter((r) => r.direction === "income")
      .reduce((s, r) => s + Number(r.amount), 0);
    const totalExpense = records
      .filter((r) => r.direction === "out")
      .reduce((s, r) => s + Number(r.amount), 0);

    const categoryBreakdown: Record<string, number> = {};
    for (const r of records.filter((r) => r.direction === "out")) {
      const code = r.categoryL1 || r.categoryCode || "other";
      categoryBreakdown[code] = (categoryBreakdown[code] || 0) + Number(r.amount);
    }

    const monthlyData: Record<string, { income: number; expense: number }> = {};
    for (const r of records) {
      const month = r.invoiceDate ? r.invoiceDate.substring(0, 7) : "未知";
      if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
      if (r.direction === "income") monthlyData[month].income += Number(r.amount);
      else monthlyData[month].expense += Number(r.amount);
    }

    summary = JSON.parse(JSON.stringify({
      totalIncome,
      totalExpense,
      grossProfit: totalIncome - totalExpense,
      grossMargin: totalIncome > 0 ? (totalIncome - totalExpense) / totalIncome * 100 : 0,
      categoryBreakdown,
      monthlyData,
    }));
  }

  return (
    <AnalysisClient
      projectId={projectId}
      projectName={project.name}
      existingAnalysis={project.aiAnalysis}
      analysisAt={project.aiAnalysisAt?.toISOString() || null}
      planCode={user?.planCode || "free"}
      initialSummary={summary}
    />
  );
}
