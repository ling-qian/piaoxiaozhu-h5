import { MERCHANT_DICT, MERCHANT_ALIASES, KEYWORD_MAP, CATEGORY_MAP } from "./constants";
import { llmCategorize } from "./llm";

interface CategorizeResult {
  categoryCode: string;
  categoryL1: string;
  categoryL2: string;
  confidence: number;
  reason: string;
}

/** 同步分类（Layer 1-3 + Layer 5 默认），不调用 LLM */
export function categorize(
  merchantName: string | null,
  rawText: string,
  industry: string = "restaurant"
): CategorizeResult {
  const result = tryMerchantMatch(merchantName);
  if (result) return result;

  const keywordResult = tryKeywordMatch(rawText);
  if (keywordResult) return keywordResult;

  const templateResult = tryIndustryTemplate(industry);
  if (templateResult) return templateResult;

  return {
    categoryCode: "other",
    categoryL1: "其他",
    categoryL2: "其他",
    confidence: 0.5,
    reason: "默认分类",
  };
}

/** 异步分类（Layer 1-3 → Layer 4 LLM → Layer 5 默认） */
export async function categorizeWithLlm(
  merchantName: string | null,
  rawText: string,
  industry: string = "restaurant"
): Promise<CategorizeResult> {
  const result = tryMerchantMatch(merchantName);
  if (result) return result;

  const keywordResult = tryKeywordMatch(rawText);
  if (keywordResult) return keywordResult;

  const templateResult = tryIndustryTemplate(industry);
  if (templateResult) return templateResult;

  // Layer 4: LLM 补充分类
  const llmResult = await llmCategorize(merchantName, rawText);
  if (llmResult) {
    const cat = CATEGORY_MAP[llmResult.categoryCode];
    return {
      categoryCode: llmResult.categoryCode,
      categoryL1: llmResult.categoryL1,
      categoryL2: cat?.l2 || llmResult.categoryL1,
      confidence: 0.7,
      reason: llmResult.reason,
    };
  }

  // Layer 5: 默认
  // **优化点：将LLM的失败结果作为"建议"而非直接丢弃，让前端展示并允许用户修正**
  return {
    categoryCode: "llm_failed",
    categoryL1: "AI建议失败",
    categoryL2: "AI建议失败",
    confidence: 0.3,
    reason: "LLM分类失败，使用默认分类",
  };
}

function tryMerchantMatch(
  merchantName: string | null
): CategorizeResult | null {
  if (!merchantName) return null;
    // Layer 1a: 精确匹配商户字典
  for (const [merchant, code] of Object.entries(MERCHANT_DICT)) {
  if (merchantName.includes(merchant)) {
  const cat = CATEGORY_MAP[code];
  if (cat) {
  return {
  categoryCode: cat.code,
  categoryL1: cat.l1,
  categoryL2: cat.l2,
  confidence: 1.0,
  reason: `商户字典匹配: ${merchant}`,
  };
  }
  }
  }
    // Layer 1b: 别名匹配
  for (const [alias, primaryKey] of Object.entries(MERCHANT_ALIASES)) {
  if (merchantName.includes(alias)) {
  const code = MERCHANT_DICT[primaryKey];
  const cat = code ? CATEGORY_MAP[code] : undefined;
  if (cat) {
  return {
  categoryCode: cat.code,
  categoryL1: cat.l1,
  categoryL2: cat.l2,
  confidence: 0.95,
  reason: `商户别名匹配: ${alias} → ${primaryKey}`,
  };
  }
  }
  }
    // Layer 1c: 模糊匹配 — 商户名包含字典key的子串（去掉常见后缀后匹配）
  const stripped = stripMerchantSuffix(merchantName);
  for (const [merchant, code] of Object.entries(MERCHANT_DICT)) {
  if (stripped.includes(merchant) && !merchantName.includes(merchant)) {
  const cat = CATEGORY_MAP[code];
  if (cat) {
  return {
  categoryCode: cat.code,
  categoryL1: cat.l1,
  categoryL2: cat.l2,
  confidence: 0.8,
  reason: `商户模糊匹配: ${merchantName} → ${merchant}`,
  };
  }
  }
  }
    // **新增 Layer 1d: 模糊子串匹配（不依赖后缀剥离）**
  for (const [merchant, code] of Object.entries(MERCHANT_DICT)) {
  if (merchantName.includes(merchant)) {
  const cat = CATEGORY_MAP[code];
  if (cat) {
  return {
  categoryCode: cat.code,
  categoryL1: cat.l1,
  categoryL2: cat.l2,
  confidence: 0.85,
  reason: `商户模糊子串匹配: ${merchantName} 包含 ${merchant}`,
  };
  }
  }
  }
    return null;
  }

/** 去掉商户名中的常见后缀词，提取核心名称 */
function stripMerchantSuffix(name: string): string {
  const suffixes = [
    "有限公司", "有限责任公司", "股份公司", "股份有限公司",
    "分公司", "分店", "门店", "加盟店", "直营店",
    "科技", "网络", "信息", "服务", "管理", "咨询",
    "餐饮", "食品", "商贸", "贸易", "供应链",
  ];
  let result = name;
  for (const suffix of suffixes) {
    if (result.endsWith(suffix)) {
      result = result.slice(0, -suffix.length);
    }
  }
  return result;
}

function tryKeywordMatch(rawText: string): CategorizeResult | null {
  for (const [keyword, code] of Object.entries(KEYWORD_MAP)) {
    if (rawText.includes(keyword)) {
      const cat = CATEGORY_MAP[code];
      if (cat) {
        return {
          categoryCode: cat.code,
          categoryL1: cat.l1,
          categoryL2: cat.l2,
          confidence: 0.85,
          reason: `关键词匹配: ${keyword}`,
        };
      }
    }
  }
  return null;
}

function tryIndustryTemplate(industry: string): CategorizeResult | null {
  if (industry === "restaurant") {
    return {
      categoryCode: "food_material",
      categoryL1: "食材",
      categoryL2: "食材",
      confidence: 0.6,
      reason: "餐饮行业默认分类",
    };
  }
  return null;
}
