import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getProjects } from "@/lib/actions/project-actions";
import { getRecordsForReport } from "@/lib/actions/record-actions";

/**
 * 首页仪表盘：近 6 个月趋势 + 本月汇总 + 本月支出 Top5 分类。
 *
 * 已从 Prisma 直连改为走 action 层（后端 API）。聚合仍在服务端做，
 * 因为要跨全部项目合并，放到浏览器算会让首屏变慢。
 *
 * 注意 direction 的取值：旧数据用 "in"/"out"，新接口用 "income"/"out"。
 * 这里两种都认，否则历史记录会被算成 0。
 */
function isIncome(direction: string | null | undefined): boolean {
  return direction === "income" || direction === "in";
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const now = new Date();
  const months: { label: string; year: number; month: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: `${d.getMonth() + 1}月`, year: d.getFullYear(), month: d.getMonth() });
  }

  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  let records: Awaited<ReturnType<typeof getRecordsForReport>> = [];
  try {
    const projects = await getProjects();
    // 逐个项目拉全量记录。项目数一般个位数，串行即可；
    // 并发会让后端瞬时压力变大，收益不明显。
    for (const p of projects) {
      const items = await getRecordsForReport(p.id);
      records.push(...items);
    }
  } catch {
    // 拉不到数据时返回空图表，而不是让首页整个报错
    return NextResponse.json({
      trend: months.map((m) => ({ label: m.label, income: 0, expense: 0 })),
      summary: { income: 0, expense: 0, net: 0, recordCount: 0 },
      topCategories: [],
    });
  }

  const withinSixMonths = records.filter((r) => {
    const t = new Date(r.createdAt);
    return !Number.isNaN(t.getTime()) && t >= sixMonthsAgo;
  });

  const trend = months.map(({ label, year, month }) => {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 1);
    const inRange = withinSixMonths.filter((r) => {
      const t = new Date(r.createdAt);
      return t >= start && t < end;
    });

    const income = inRange
      .filter((r) => isIncome(r.direction))
      .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
    const expense = inRange
      .filter((r) => !isIncome(r.direction))
      .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

    return {
      label,
      // 月份标签交给前端按语言格式化。服务端写死「5月」，英文界面会冒出中文。
      year,
      month: month + 1,
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
    };
  });

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRecords = withinSixMonths.filter((r) => new Date(r.createdAt) >= monthStart);

  const monthIncome = monthRecords
    .filter((r) => isIncome(r.direction))
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const monthExpense = monthRecords
    .filter((r) => !isIncome(r.direction))
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

  // 按 categoryCode 聚合，而不是按中文名。前端要用 code 查当前语言的标签，
  // 只给中文名的话，英文界面没法本地化。
  const categoryMap: Record<string, { code: string; name: string; amount: number }> = {};
  for (const r of monthRecords) {
    if (isIncome(r.direction)) continue;
    const code = r.categoryCode || "other";
    const row = categoryMap[code] ?? { code, name: r.categoryL1 || "", amount: 0 };
    row.amount += Number(r.amount ?? 0);
    categoryMap[code] = row;
  }

  const topCategories = Object.values(categoryMap)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((c) => ({ code: c.code, name: c.name, amount: Math.round(c.amount * 100) / 100 }));

  return NextResponse.json({
    trend,
    summary: {
      income: Math.round(monthIncome * 100) / 100,
      expense: Math.round(monthExpense * 100) / 100,
      net: Math.round((monthIncome - monthExpense) * 100) / 100,
      recordCount: monthRecords.length,
    },
    topCategories,
  });
}
