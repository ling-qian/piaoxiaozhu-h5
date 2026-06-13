import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRecordsForReport } from "@/lib/actions/record-actions";
import { generateReport } from "@/lib/report";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: { projectId?: string; format?: string; month?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const { projectId, format = "csv", month } = body;

  if (!projectId) {
    return NextResponse.json({ error: "缺少项目ID" }, { status: 400 });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: "项目ID格式无效" }, { status: 400 });
  }

  if (format !== "csv" && format !== "json") {
    return NextResponse.json({ error: "不支持的导出格式" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) {
    return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 403 });
  }

  try {
    const records = await getRecordsForReport(projectId);
    const report = generateReport(
      records.map((r) => ({
        direction: r.direction,
        amount: Number(r.amount),
        categoryCode: r.categoryCode,
        invoiceDate: r.invoiceDate,
      })),
      month
    );

    if (format === "csv") {
      const header = "分类,金额,占比\n";
      const rows = report.categoryBreakdown
        .map((c) => `${c.name},${c.amount.toFixed(2)},${c.percentage.toFixed(1)}%`)
        .join("\n");
      const summary = `\n\n总收入,${report.totalIncome.toFixed(2)}\n总支出,${report.totalExpense.toFixed(2)}\n毛利润,${report.grossProfit.toFixed(2)}\n毛利率,${report.grossMargin.toFixed(1)}%`;

      const csv = "\uFEFF" + header + rows + summary;
      const safeName = encodeURIComponent(project.name || projectId);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${safeName}-report.csv`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "导出失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
