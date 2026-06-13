const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL_NAME || "stepfun-ai/step-3.5-flash";

const LLM_TIMEOUT_MS = 15_000; // LLM 请求最大 15 秒

const VALID_CATEGORY_CODES = new Set([
  "food_material",
  "rent",
  "salary",
  "utilities",
  "platform_fee",
  "advertising",
  "office",
  "other",
]);

interface LlmCategorizeResult {
  categoryCode: string;
  categoryL1: string;
  reason: string;
}

export async function llmCategorize(
  merchantName: string | null,
  rawText: string
): Promise<LlmCategorizeResult | null> {
  if (!LLM_API_KEY) {
    console.warn("[llmCategorize] LLM_API_KEY 未配置，跳过 LLM 分类");
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

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
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[llmCategorize] API 返回错误: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const categoryCode = parsed.categoryCode || "other";

    // 校验 LLM 返回的分类代码是否合法，防止幻觉
    if (!VALID_CATEGORY_CODES.has(categoryCode)) {
      console.warn(`[llmCategorize] LLM 返回了无效分类: ${categoryCode}，降级为 other`);
      return {
        categoryCode: "other",
        categoryL1: "其他",
        reason: `LLM返回无效分类(${categoryCode})，已降级`,
      };
    }

    return {
      categoryCode,
      categoryL1: parsed.categoryL1 || "其他",
      reason: parsed.reason || "LLM分类",
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("[llmCategorize] 请求超时");
    } else {
      console.error("[llmCategorize] 调用失败:", err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
