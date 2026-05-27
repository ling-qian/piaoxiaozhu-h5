import { auth } from "@/lib/auth";
import { getRecordsForReport } from "@/lib/actions/record-actions";
import { generateReport } from "@/lib/report";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const format = searchParams.get("format") || "csv";
  const month = searchParams.get("month") || undefined;

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

  try {
    const records = await getRecordsForReport(projectId);
    const report = generateReport(
      records.map((r) => ({
        direction: r.direction,
        amount: r.amount,
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
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=report-${projectId}.csv`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "导出失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
