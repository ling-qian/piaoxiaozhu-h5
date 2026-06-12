import { MERCHANT_DICT, KEYWORD_MAP, CATEGORY_MAP } from "./constants";
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
  return {
    categoryCode: "other",
    categoryL1: "其他",
    categoryL2: "其他",
    confidence: 0.5,
    reason: "默认分类",
  };
}

function tryMerchantMatch(
  merchantName: string | null
): CategorizeResult | null {
  if (!merchantName) return null;

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
  return null;
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
