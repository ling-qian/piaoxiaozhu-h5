import { NextResponse } from "next/server";

import { adminFetch, getAdminToken } from "@/lib/admin";

/** 微信凭证体检。部署后第一件该跑的事 */
export async function GET() {
  const token = await getAdminToken();
  if (!token) {
    return NextResponse.json({ error: "未登录后台" }, { status: 401 });
  }

  try {
    const data = await adminFetch("/api/admin/diagnostics/wechat", token);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "体检失败" },
      { status: 502 },
    );
  }
}
