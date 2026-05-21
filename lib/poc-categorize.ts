export type PocCategoryResult = {
  categoryCode: string
  confidence: number
  reason: string
}

type CategoryRule = {
  categoryCode: string
  keywords: string[]
  reason: string
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    categoryCode: "platform_fee",
    keywords: ["美团", "饿了么", "抖音", "平台服务费", "技术服务费", "佣金", "平台扣点"],
    reason: "命中平台服务相关关键词",
  },
  {
    categoryCode: "food_material",
    keywords: ["蔬菜", "生鲜", "粮油", "冻品", "调味", "牛肉", "猪肉", "鸡肉", "海鲜", "米", "面", "食材", "农贸"],
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
    keywords: ["工资", "薪资", "劳务", "用工", "工资表"],
    reason: "命中工资劳务相关关键词",
  },
]

export function categorizeRestaurantExpense(input: {
  merchant?: string | null
  text?: string | null
  name?: string | null
}): PocCategoryResult {
  const source = [input.merchant, input.text, input.name].filter(Boolean).join(" ").toLowerCase()

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => source.includes(keyword.toLowerCase()))) {
      return {
        categoryCode: rule.categoryCode,
        confidence: 0.95,
        reason: rule.reason,
      }
    }
  }

  return {
    categoryCode: "other",
    confidence: 0.5,
    reason: "未命中特定规则，归类为其他",
  }
}
