import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** 获取当前用户的升级请求 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const requests = await prisma.planUpgradeRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({ requests });
}
