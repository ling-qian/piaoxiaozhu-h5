import { NextRequest, NextResponse } from "next/server";

import { adminFetch, setAdminCookie } from "@/lib/admin";

/**
 * 管理员登录：把令牌校验一遍再存进 httpOnly cookie。
 *
 * 校验方式是实际调一次 overview——令牌对不对只有 Worker 知道。
 * 不校验就存，用户会在进后台后看到满屏 401，分不清是令牌错还是系统坏。
 */
export async function POST(req: NextRequest) {
  let token = "";
  try {
    const body = await req.json();
    token = String(body?.token ?? "").trim();
  } catch {
    // 请求体不是 JSON，按空令牌处理
  }

  if (!token) {
    return NextResponse.json({ error: "请输入管理令牌" }, { status: 400 });
  }

  try {
    await adminFetch("/api/admin/overview", token);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "令牌校验失败" },
      { status: 401 },
    );
  }

  await setAdminCookie(token);
  return NextResponse.json({ ok: true });
}
