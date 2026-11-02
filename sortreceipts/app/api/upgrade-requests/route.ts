import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * 当前用户的升级申请列表。
 *
 * ## 为什么现在返回空数组
 *
 * 这个功能依赖 `planUpgradeRequest` 这张表，而后端（Worker 与旧 FastAPI）
 * 都没有对应模型。H5 的数据层已经切到后端 API，直连数据库的路子被关掉了，
 * 所以功能暂时无法提供。
 *
 * 返回空数组而不是 404 或 500，是因为会员页会无条件拉这个接口：
 * 报错会让整页显示「加载失败」，连带把能用的部分也遮住。
 * 空数组表示「没有待处理的申请」，页面照常渲染。
 *
 * 要恢复这个功能，需要在后端建表并提供两个接口：
 *   GET  /api/upgrade-requests    列出本人申请
 *   POST /api/upgrade-requests    提交申请
 * 恢复前请勿在界面上引导用户提交——提交会失败。
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  return NextResponse.json({ requests: [] });
}
