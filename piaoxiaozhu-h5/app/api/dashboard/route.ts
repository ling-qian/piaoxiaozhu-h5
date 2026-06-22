import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();

  // 近6个月数据
  const months: { label: string; year: number; month: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: `${d.getMonth() + 1}月`,
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }

  // 查询近6个月所有记录
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const records = await prisma.record.findMany({
    where: {
      userId,
      createdAt: { gte: sixMonthsAgo },
    },
    select: {
      amount: true,
      direction: true,
      createdAt: true,
      categoryL1: true,
    },
  });

  // 按月汇总
  const trend = months.map(({ label, year, month }) => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 1);
    const monthRecords = records.filter(
      (r) => r.createdAt >= monthStart && r.createdAt < monthEnd
    );

    const income = monthRecords
      .filter((r) => r.direction === "in")
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const expense = monthRecords
      .filter((r) => r.direction === "out")
      .reduce((sum, r) => sum + Number(r.amount), 0);

    return { label, income: Math.round(income * 100) / 100, expense: Math.round(expense * 100) / 100 };
  });

  // 本月汇总
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRecords = records.filter((r) => r.createdAt >= monthStart);

  const monthIncome = monthRecords
    .filter((r) => r.direction === "in")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const monthExpense = monthRecords
    .filter((r) => r.direction === "out")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  // 本月分类支出 Top5
  const categoryMap: Record<string, number> = {};
  monthRecords
    .filter((r) => r.direction === "out")
    .forEach((r) => {
      const cat = r.categoryL1 || "其他";
      categoryMap[cat] = (categoryMap[cat] || 0) + Number(r.amount);
    });

  const topCategories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }));

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
