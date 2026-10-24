/**
 * 支出分类——从 `packages/core/piaoxiaozhu_core/categorize.py` 移植。
 *
 * 四层判定，逐层兜底：
 *   1. 商户名精确匹配字典（置信度 1.0）
 *   2. 票面/商户文本关键词（0.95）
 *   3. 模板优先级（当前为空实现，保留位置）
 *   4. LLM 分类（调用方注入；未注入则跳过）
 *   5. 都没有 → 「其他」（0.5）
 */

export interface CategorizeResult {
  categoryCode: string;
  categoryL1: string;
  categoryL2: string;
  confidence: number;
  reason: string;
  isManualCorrected?: boolean;
}

export const CATEGORY_L1_MAP: Record<string, string> = {
  food_material: "食材",
  rent: "房租",
  salary: "工资",
  utilities: "水电",
  platform_fee: "平台佣金",
  advertising: "广告",
  office: "办公",
  other: "其他",
};

export const CATEGORY_L2_MAP: Record<string, string> = {
  food_material: "蔬菜/生鲜/粮油/冻品/调味/肉禽/海鲜/米/面/食材/农贸",
  rent: "房租/租赁/物业/场地/租金",
  salary: "工资/薪资/劳务/用工/工资表",
  utilities: "电费/水费/燃气/天然气/供电/供水",
  platform_fee: "美团/饿了么/抖音/平台服务费/技术服务费/佣金/平台扣点",
  advertising: "广告/推广/营销/传单/宣传",
  office: "办公/文具/打印/纸张/耗材",
  other: "",
};

/** 商户名精确匹配字典（与 Python 版 RESTAURANT_MERCHANT_DICT 一致） */
export const RESTAURANT_MERCHANT_DICT: Record<string, string> = {
  美团: "platform_fee",
  美团外卖: "platform_fee",
  饿了么: "platform_fee",
  抖音生活服务: "platform_fee",
  北京蔬菜批发市场: "food_material",
  新发地农贸市场: "food_material",
  国家电网: "utilities",
  自来水公司: "utilities",
  华润燃气: "utilities",
};

interface ReceiptRule {
  categoryCode: string;
  keywords: string[];
  reason: string;
}

const RECEIPT_RULES: ReceiptRule[] = [
  {
    categoryCode: "platform_fee",
    keywords: ["美团", "饿了么", "抖音", "平台服务费", "技术服务费", "佣金", "平台扣点"],
    reason: "命中平台服务相关关键词",
  },
  {
    categoryCode: "food_material",
    keywords: [
      "蔬菜", "生鲜", "粮油", "冻品", "调味", "牛肉", "猪肉", "鸡肉", "海鲜",
      "食材", "农贸", "餐饮", "食品", "水产", "水果", "干货", "调料", "副食",
      // 单字「米」「面」会命中「平米」「面积」等房租票面用词，
      // 导致房租被误判成食材，所以只用多字词。
      "大米", "玉米", "糯米", "面粉", "面条", "米线",
    ],
    reason: "命中食材采购相关关键词",
  },
  {
    categoryCode: "rent",
    keywords: ["房租", "租赁", "物业", "场地", "租金"],
    reason: "命中房租场地相关关键词",
  },
  {
    categoryCode: "utilities",
    keywords: ["电费", "水费", "燃气", "天然气", "供电", "供水"],
    reason: "命中水电燃气相关关键词",
  },
  {
    categoryCode: "salary",
    // 不能用裸「劳务」：增值税发票的标准列头是「货物或应税劳务名称」，
    // 会让**每一张增值税发票**都命中工资分类（实测京东大药房票被判成工资）。
    // 改用「劳务费/劳务报酬/劳务派遣」这类真正指向劳务支出的词。
    keywords: ["工资", "薪资", "劳务费", "劳务报酬", "劳务派遣", "用工", "工资表"],
    reason: "命中工资劳务相关关键词",
  },
  {
    categoryCode: "advertising",
    keywords: ["广告", "推广", "营销", "传单", "宣传"],
    reason: "命中广告推广相关关键词",
  },
  {
    categoryCode: "office",
    keywords: ["办公", "文具", "打印", "纸张", "耗材"],
    reason: "命中办公用品相关关键词",
  },
];

/** LLM 分类器接口。Worker 里由调用方注入（走 fetch 到模型），避免本模块依赖网络。 */
export type LlmClassifier = (
  merchant: string | null,
  text: string | null,
  categories: string[]
) => Promise<CategorizeResult | null>;

function build(code: string, confidence: number, reason: string): CategorizeResult {
  return {
    categoryCode: code,
    categoryL1: CATEGORY_L1_MAP[code] ?? "其他",
    categoryL2: CATEGORY_L2_MAP[code] ?? "",
    confidence,
    reason,
  };
}

function layer1MerchantDict(merchant: string | null): CategorizeResult | null {
  if (!merchant) return null;
  const code = RESTAURANT_MERCHANT_DICT[merchant];
  if (!code) return null;
  return build(code, 1.0, `商户名称精确匹配: ${merchant}`);
}

function layer2ReceiptText(
  merchant: string | null,
  text: string | null,
  name: string | null
): CategorizeResult | null {
  const source = [merchant, text, name].filter(Boolean).join(" ");
  if (!source) return null;
  for (const rule of RECEIPT_RULES) {
    if (rule.keywords.some((kw) => source.includes(kw))) {
      return build(rule.categoryCode, 0.95, rule.reason);
    }
  }
  return null;
}

export interface CategorizeOptions {
  merchant?: string | null;
  text?: string | null;
  name?: string | null;
  llmClassifier?: LlmClassifier | null;
}

export async function categorizeExpense(opts: CategorizeOptions = {}): Promise<CategorizeResult> {
  const merchant = opts.merchant ?? null;
  const text = opts.text ?? null;
  const name = opts.name ?? null;

  const l1 = layer1MerchantDict(merchant);
  if (l1) return l1;

  const l2 = layer2ReceiptText(merchant, text, name);
  if (l2) return l2;

  // 第 3 层（模板优先级）在旧实现里是空实现，这里保留位置但直接跳过

  if (opts.llmClassifier) {
    const l4 = await opts.llmClassifier(merchant, text ?? name, Object.keys(CATEGORY_L1_MAP));
    if (l4) return l4;
  }

  return build("other", 0.5, "未命中特定规则，归类为其他");
}
