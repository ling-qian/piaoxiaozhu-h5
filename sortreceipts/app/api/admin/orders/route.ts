import { NextRequest, NextResponse } from "next/server";

import { adminFetch, getAdminToken } from "@/lib/admin";

/** 订单列表。查询参数原样转发给 Worker，避免在 H5 再维护一份分页/筛选逻辑 */
export async function GET(req: NextRequest) {
  const token = await getAdminToken();
  if (!token) {
    return NextResponse.json({ error: "未登录后台" }, { status: 401 });
  }

  const qs = req.nextUrl.searchParams.toString();
  const path = `/api/admin/orders${qs ? `?${qs}` : ""}`;

  try {
    const data = await adminFetch(path, token);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "查询失败" },
      { status: 502 },
    );
  }
}
