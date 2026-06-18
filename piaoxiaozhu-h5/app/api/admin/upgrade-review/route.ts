import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plan-config";

/** 管理员：获取所有待审核请求 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  // 简单判断管理员（邮箱包含 admin 或 planCode 为 enterprise）
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.email !== "admin@piaoxiaozhu.com") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const requests = await prisma.planUpgradeRequest.findMany({
    where: { status: "pending" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requests });
}

/** 管理员：审核请求（通过/拒绝） */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const adminUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!adminUser || adminUser.email !== "admin@piaoxiaozhu.com") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json();
  const { requestId, action, reviewNote } = body;

  if (!requestId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const request = await prisma.planUpgradeRequest.findUnique({
    where: { id: requestId },
  });

  if (!request || request.status !== "pending") {
    return NextResponse.json({ error: "请求不存在或已处理" }, { status: 400 });
  }

  if (action === "approve") {
    const config = PLANS[request.planCode];
    if (!config) {
      return NextResponse.json({ error: "无效套餐" }, { status: 400 });
    }

    // 事务：更新请求状态 + 升级用户套餐
    await prisma.$transaction([
      prisma.planUpgradeRequest.update({
        where: { id: requestId },
        data: {
          status: "approved",
          reviewedAt: new Date(),
          reviewedBy: adminUser.id,
          reviewNote: reviewNote || null,
        },
      }),
      prisma.user.update({
        where: { id: request.userId },
        data: {
          planCode: request.planCode,
          quotaTotal: config.aiQuota === -1 ? 999999 : config.aiQuota,
        },
      }),
    ]);

    return NextResponse.json({ success: true, message: "已通过并升级" });
  } else {
    // 拒绝
    await prisma.planUpgradeRequest.update({
      where: { id: requestId },
      data: {
        status: "rejected",
        reviewedAt: new Date(),
        reviewedBy: adminUser.id,
        reviewNote: reviewNote || "未检测到付款，请确认后重新提交",
      },
    });

    return NextResponse.json({ success: true, message: "已拒绝" });
  }
}
