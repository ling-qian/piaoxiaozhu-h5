import { NextRequest, NextResponse } from "next/server";

import { adminFetch, getAdminToken } from "@/lib/admin";

/** 合作方列表（带归因统计） */
export async function GET() {
  const token = await getAdminToken();
  if (!token) {
    return NextResponse.json({ error: "未登录后台" }, { status: 401 });
  }

  try {
    const data = await adminFetch("/api/admin/partners", token);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "查询失败" },
      { status: 502 },
    );
  }
}

/** 新建合作方。推荐码由 Worker 生成，前端只提交名称与联系方式 */
export async function POST(req: NextRequest) {
  const token = await getAdminToken();
  if (!token) {
    return NextResponse.json({ error: "未登录后台" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  try {
    const data = await adminFetch("/api/admin/partners", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "创建失败" },
      { status: 502 },
    );
  }
}
