import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getProjectById } from "@/lib/actions/project-actions";
import { getRecordsForReport } from "@/lib/actions/record-actions";
import { getUserInfo } from "@/lib/actions/user-actions";
import AnalysisClient from "./analysis-client";

/**
 * AI 分析页。
 *
 * 数据来源已改为 action 层（后端 API），不再直连数据库。
 *
 * 一处行为差异：原来读 `project.aiAnalysis` 显示上一次的分析结论，
 * 后端项目表里没有这个字段（分析结果不落库，每次重新生成）。
 * 因此这里固定传 null，页面按「还没分析过」呈现。
 */
function isIncome(direction: string | null | undefined): boolean {
  return direction === "income" || direction === "in";
}

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const { project: projectId } = await searchParams;
  if (!projectId) redirect("/");

  const project = await getProjectById(projectId, session.user.id);
  if (!project) redirect("/");

  const user = await getUserInfo().catch(() => null);

  // 汇总数据用于图表。拿不到记录就传 null，页面会自己处理空态。
  let summary: {
    totalIncome: number;
    totalExpense: number;
    grossProfit: number;
    grossMargin: number;
    categoryBreakdown: Record<string, number>;
    monthlyData: Record<string, { income: number; expense: number }>;
  } | null = null;

  try {
    const records = await getRecordsForReport(projectId);

    if (records.length > 0) {
      let totalIncome = 0;
      let totalExpense = 0;
      const categoryBreakdown: Record<string, number> = {};
      const monthlyData: Record<string, { income: number; expense: number }> = {};

      for (const r of records) {
        const amount = Number(r.amount ?? 0);
        const income = isIncome(r.direction);
        if (income) totalIncome += amount;
        else totalExpense += amount;

        if (!income) {
          // 优先用 code：前端据此查当前语言的分类名。
          // 老记录没有 code 时用中文名兜底，categoryLabel 也认这些名字。
          const code = r.categoryCode || r.categoryL1 || "other";
          categoryBreakdown[code] = (categoryBreakdown[code] || 0) + amount;
        }

        // 没有开票日期时归到「未知」，否则图表会缺一整个月的数据
        const month = r.invoiceDate ? String(r.invoiceDate).substring(0, 7) : "未知";
        if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
        if (income) monthlyData[month].income += amount;
        else monthlyData[month].expense += amount;
      }

      summary = {
        totalIncome,
        totalExpense,
        grossProfit: totalIncome - totalExpense,
        grossMargin: totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0,
        categoryBreakdown,
        monthlyData,
      };
    }
  } catch {
    // 汇总失败不影响分析功能本身，页面显示空图表即可
    summary = null;
  }

  return (
    <AnalysisClient
      projectId={projectId}
      projectName={project.name}
      existingAnalysis={null}
      analysisAt={null}
      planCode={user?.planCode || "free"}
      initialSummary={summary as never}
    />
  );
}
