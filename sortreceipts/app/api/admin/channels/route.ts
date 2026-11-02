import { NextResponse } from "next/server";

import { adminFetch, getAdminToken } from "@/lib/admin";

/** 渠道来源统计。Worker 按 source + medium 聚合注册与付费 */
export async function GET() {
  const token = await getAdminToken();
  if (!token) {
    return NextResponse.json({ error: "未登录后台" }, { status: 401 });
  }

  try {
    const data = await adminFetch("/api/admin/channels", token);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "查询失败" },
      { status: 502 },
    );
  }
}
