import { NextRequest, NextResponse } from "next/server";

import { ApiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { requireExportPlan } from "@/lib/plan";
import { getRecordsForReport } from "@/lib/actions/record-actions";

/**
 * 导出项目的全部记录为 CSV。
 *
 * 数据来源改为 action 层（后端 API），不再直连数据库。
 *
 * 两个容易出错的地方：
 * 1. **BOM**：不加 UTF-8 BOM，Excel 打开中文会乱码，用户会以为导出坏了。
 * 2. **字段转义**：商户名里常有逗号和引号，不转义会把列打乱。
 */
function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Excel / WPS 会把 = + - @ 开头的单元格当公式执行。纯数字（包括负数）放行，
  // 否则金额会被转成文本；其余以这些字符开头的内容前面加单引号，强制按文本读。
  const looksNumeric = /^-?\d+(\.\d+)?$/.test(s);
  const safe = !looksNumeric && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  // 含逗号、引号、换行时必须用双引号包裹，内部引号翻倍
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function isIncome(direction: string | null | undefined): boolean {
  return direction === "income" || direction === "in";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  // 导出是付费权益。按钮在页面上会隐藏，但这条路由可以直接访问，
  // 所以要在服务端再判一次套餐。
  try {
    await requireExportPlan();
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: "套餐校验失败，请稍后重试" }, { status: 502 });
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
  }

  let records: Awaited<ReturnType<typeof getRecordsForReport>>;
  try {
    records = await getRecordsForReport(projectId);
  } catch {
    return NextResponse.json({ error: "记录加载失败，请稍后重试" }, { status: 500 });
  }

  // 表头用英文，和后端交付包的 CSV（v1/apps/api-worker/src/lib/pack.ts）保持一致。
  // 两个导出面向的是同一批会计：一份中文表头、一份英文表头，他们得对两遍列名。
  const header = ["Date", "Merchant", "Amount", "Direction", "Category", "Subcategory", "Tax No", "Invoice No", "Note"];

  // 按日期倒序，和页面上的显示顺序一致
  const sorted = [...records].sort((a, b) => String(b.invoiceDate).localeCompare(String(a.invoiceDate)));

  const lines = [header.join(",")];
  for (const r of sorted) {
    lines.push(
      [
        escapeCsv(r.invoiceDate),
        escapeCsv(r.merchantName),
        escapeCsv(r.amount ?? 0),
        isIncome(r.direction) ? "Income" : "Expense",
        escapeCsv(r.categoryL1),
        escapeCsv(r.categoryL2),
        escapeCsv(r.taxNo),
        escapeCsv(r.invoiceNo),
        escapeCsv(r.reason),
      ].join(","),
    );
  }

  const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
  const filename = `records_${projectId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // filename* 用 RFC 5987 编码，中文名在 Safari 上也能正常落盘
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
