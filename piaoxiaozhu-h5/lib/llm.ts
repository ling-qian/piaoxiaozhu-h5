const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL_NAME || "stepfun-ai/step-3.5-flash";

interface LlmCategorizeResult {
  categoryCode: string;
  categoryL1: string;
  reason: string;
}

export async function llmCategorize(
  merchantName: string | null,
  rawText: string
): Promise<LlmCategorizeResult | null> {
  if (!LLM_API_KEY) return null;

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
          {
            role: "system",
            content: `你是一个餐饮票据分类助手。根据商户名称和票据文本，将支出分类为以下之一：
- food_material: 食材
- rent: 房租
- salary: 工资
- utilities: 水电燃气
- platform_fee: 平台佣金
- advertising: 广告推广
- office: 办公用品
- other: 其他

请严格以JSON格式回复：{"categoryCode":"xxx","categoryL1":"xxx","reason":"xxx"}`,
          },
          {
            role: "user",
            content: `商户名称: ${merchantName || "未知"}\n票据文本: ${rawText.substring(0, 500)}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      categoryCode: parsed.categoryCode || "other",
      categoryL1: parsed.categoryL1 || "其他",
      reason: parsed.reason || "LLM分类",
    };
  } catch {
    return null;
  }
}
