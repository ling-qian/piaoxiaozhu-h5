export type PocCategorySummary = {
  categoryCode: string
  name: string
  amount: number
}

export type RestaurantPocReport = {
  totalIncome: number
  totalCost: number
  grossProfit: number
  grossMargin: number
  costByCategory: PocCategorySummary[]
}

type ReportTransaction = {
  type?: string | null
  total?: number | null
  categoryCode?: string | null
  category?: { name: string; code: string } | null
}

const CATEGORY_NAMES: Record<string, string> = {
  food_material: "食材",
  rent: "房租",
  salary: "工资",
  utilities: "水电",
  platform_fee: "平台佣金",
  other: "其他",
}

export function buildRestaurantPocReport(transactions: ReportTransaction[]): RestaurantPocReport {
  let totalIncome = 0
  let totalCost = 0
  const costByCategoryMap: Record<string, number> = {}

  for (const tx of transactions) {
    const amount = tx.total ?? 0
    if (tx.type === "income") {
      totalIncome += amount
    } else {
      totalCost += amount
      const code = tx.categoryCode || "other"
      costByCategoryMap[code] = (costByCategoryMap[code] || 0) + amount
    }
  }

  const grossProfit = totalIncome - totalCost
  const grossMargin = totalIncome > 0 ? grossProfit / totalIncome : 0

  const costByCategory = Object.entries(costByCategoryMap)
    .map(([categoryCode, amount]) => ({
      categoryCode,
      name: CATEGORY_NAMES[categoryCode] || categoryCode,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    totalIncome,
    totalCost,
    grossProfit,
    grossMargin,
    costByCategory,
  }
}

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function formatPercent(ratio: number): string {
  return (ratio * 100).toFixed(1) + "%"
}
