import { NextRequest, NextResponse } from "next/server";

import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@/lib/auth";

/**
 * AI 经营分析。
 *
 * 已从「H5 自己拼 prompt 调 LLM」改为转调后端的分析接口。
 *
 * 为什么必须换：原来 H5 用一套提示词、小程序用另一套，同一个项目的分析结论
 * 会不一样。而且原实现把「项目数量」当成「本月已用 AI 次数」来判配额
 * （`prisma.project.count`），账算得不对。现在配额由后端统一扣，两边口径一致。
 *
 * 后端返回 `{analysis, summary, points_balance}`，前端只读前两个字段，
 * 多出来的余额顺手带上，页面可以据此更新积分显示。
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let projectId: string | undefined;
  try {
    const body = await req.json();
    projectId = body?.projectId;
  } catch {
    // 请求体不是合法 JSON，走到下面的「缺少参数」分支
  }
  if (!projectId) {
    return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
  }

  try {
    const data = await apiFetch<{ analysis: string; summary: unknown; points_balance: number }>(
      `/api/projects/${projectId}/analysis`,
      { method: "POST" },
    );
    return NextResponse.json({
      analysis: data.analysis,
      summary: data.summary,
      pointsBalance: data.points_balance,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      // 402 表示后端判定积分不足，前端据此引导升级
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "分析失败，请稍后重试" }, { status: 500 });
  }
}
