import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } from "@/lib/env";
import { checkAiQuota, getPlanConfig } from "@/lib/plan-config";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!LLM_API_KEY) {
    return NextResponse.json({ error: "AI 服务未配置" }, { status: 500 });
  }

  try {
    const { projectId } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    // 检查 AI 分析配额
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { planCode: true, quotaUsed: true },
    });
    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const planConfig = getPlanConfig(user.planCode);
    if (planConfig.aiQuota === 0) {
      return NextResponse.json(
        { error: "AI 分析为付费功能，请升级到专业版或企业版" },
        { status: 403 }
      );
    }

    // 统计当月 AI 分析使用次数
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const aiUsedThisMonth = await prisma.project.count({
      where: {
        userId: session.user.id,
        aiAnalysisAt: { gte: monthStart },
      },
    });

    const aiCheck = checkAiQuota(user.planCode, aiUsedThisMonth);
    if (!aiCheck.allowed) {
      const limitLabel = aiCheck.limit === -1 ? "无限" : `${aiCheck.limit}`;
      return NextResponse.json(
        { error: `本月 AI 分析次数已达上限（${aiCheck.used}/${limitLabel}），请升级套餐` },
        { status: 403 }
      );
    }

    // 获取项目数据
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const records = await prisma.record.findMany({
      where: { projectId, userId: session.user.id },
      orderBy: { invoiceDate: "desc" },
    });

    if (records.length === 0) {
      return NextResponse.json({ error: "暂无记录数据，请先上传票据" }, { status: 400 });
    }

    // 汇总数据
    const totalIncome = records
      .filter((r) => r.direction === "income")
      .reduce((s, r) => s + Number(r.amount), 0);
    const totalExpense = records
      .filter((r) => r.direction === "out")
      .reduce((s, r) => s + Number(r.amount), 0);

    // 按分类汇总
    const categoryBreakdown: Record<string, number> = {};
    for (const r of records.filter((r) => r.direction === "out")) {
      const code = r.categoryL1 || r.categoryCode || "other";
      categoryBreakdown[code] = (categoryBreakdown[code] || 0) + Number(r.amount);
    }

    // 按月汇总
    const monthlyData: Record<string, { income: number; expense: number }> = {};
    for (const r of records) {
      const month = r.invoiceDate ? r.invoiceDate.substring(0, 7) : "未知";
      if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
      if (r.direction === "income") monthlyData[month].income += Number(r.amount);
      else monthlyData[month].expense += Number(r.amount);
    }

    // Top 商户
    const merchantSpend: Record<string, number> = {};
    for (const r of records.filter((r) => r.direction === "out")) {
      const name = r.merchantName || "未知商户";
      merchantSpend[name] = (merchantSpend[name] || 0) + Number(r.amount);
    }
    const topMerchants = Object.entries(merchantSpend)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, amount]) => `${name}: ¥${amount.toFixed(2)}`)
      .join("\n");

    const analysisPrompt = `你是一位专业的餐饮行业财务顾问。请根据以下餐厅经营数据，提供详细的利润分析和经营建议。

## 项目：${project.name}

### 总体数据
- 总收入：¥${totalIncome.toFixed(2)}
- 总支出：¥${totalExpense.toFixed(2)}
- 毛利润：¥${(totalIncome - totalExpense).toFixed(2)}
- 毛利率：${totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100).toFixed(1) : "N/A"}%
- 记录总数：${records.length}条

### 支出分类明细
${Object.entries(categoryBreakdown)
  .sort(([, a], [, b]) => b - a)
  .map(([cat, amt]) => `- ${cat}: ¥${amt.toFixed(2)} (${(amt / totalExpense * 100).toFixed(1)}%)`)
  .join("\n")}

### 月度收支
${Object.entries(monthlyData)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([month, data]) => `- ${month}: 收入 ¥${data.income.toFixed(2)}，支出 ¥${data.expense.toFixed(2)}，利润 ¥${(data.income - data.expense).toFixed(2)}`)
  .join("\n")}

### Top 10 支出商户
${topMerchants}

请从以下维度进行分析，用中文回复：

1. **利润健康度评估**：毛利率是否健康？与餐饮行业平均水平对比
2. **成本结构分析**：哪项成本占比过高？哪项有优化空间？
3. **月度趋势洞察**：收入/支出趋势如何？有无异常波动？
4. **商户集中度风险**：是否过度依赖少数供应商？
5. **具体经营建议**：给出3-5条可落地的降本增效建议
6. **风险预警**：是否有潜在的经营风险需要关注

请用专业但易懂的语言，给出具体数字和可操作的建议。`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [
            { role: "system", content: "你是一位资深餐饮行业财务顾问，擅长从经营数据中发现问题和机会，给出可落地的建议。" },
            { role: "user", content: analysisPrompt },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[AI Analysis] API 错误: ${response.status}`, errText);
        return NextResponse.json({ error: "AI 分析服务暂时不可用" }, { status: 502 });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content as string | undefined;

      if (!content) {
        return NextResponse.json({ error: "AI 分析结果为空" }, { status: 502 });
      }

      // 保存分析结果到数据库
      await prisma.project.update({
        where: { id: projectId },
        data: { aiAnalysis: content, aiAnalysisAt: new Date() },
      });

      return NextResponse.json({
        analysis: content,
        summary: {
          totalIncome,
          totalExpense,
          grossProfit: totalIncome - totalExpense,
          grossMargin: totalIncome > 0 ? (totalIncome - totalExpense) / totalIncome * 100 : 0,
          categoryBreakdown,
          monthlyData,
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.error("[AI Analysis] 错误:", err);
    const message =
      err instanceof DOMException && err.name === "AbortError"
        ? "AI 分析超时，请稍后重试"
        : "AI 分析失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
