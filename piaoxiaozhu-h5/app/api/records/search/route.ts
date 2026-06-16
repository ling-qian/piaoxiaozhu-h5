import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const keyword = searchParams.get("q") || "";
  const direction = searchParams.get("direction");
  const category = searchParams.get("category");
  const month = searchParams.get("month");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50", 10), 200);

  if (!projectId) {
    return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
  }

  // 验证项目归属
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) {
    return NextResponse.json({ error: "项目不存在或无权访问" }, { status: 404 });
  }

  // 分页边界检查
  const skip = Math.max(0, (page - 1) * pageSize);

  // 构建动态 where 条件
  const where: Record<string, unknown> = { projectId };

  if (direction && direction !== "all") {
    where.direction = direction;
  }
  if (category && category !== "all") {
    where.categoryCode = category;
  }
  if (month) {
    where.invoiceDate = { startsWith: month };
  }
  if (keyword) {
    // PostgreSQL ILIKE 模糊搜索：商户名、发票号码、日期、OCR原文
    where.OR = [
      { merchantName: { contains: keyword, mode: "insensitive" } },
      { invoiceNo: { contains: keyword, mode: "insensitive" } },
      { rawText: { contains: keyword, mode: "insensitive" } },
      { categoryL1: { contains: keyword, mode: "insensitive" } },
      { categoryL2: { contains: keyword, mode: "insensitive" } },
    ];
  }

  // 总数
  const total = await prisma.record.count({ where });

  // 分页查询
  const records = await prisma.record.findMany({
    where,
    skip,
    take: pageSize,
    orderBy: { invoiceDate: "desc" },
  });

  // 统计摘要
  const stats = await prisma.record.aggregate({
    where,
    _sum: { amount: true },
    _avg: { amount: true },
  });

  return NextResponse.json({
    records,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
    summary: {
      totalAmount: Number(stats._sum.amount || 0),
      avgAmount: Number(stats._avg.amount || 0),
    },
  });
}
