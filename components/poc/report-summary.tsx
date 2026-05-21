import { RestaurantPocReport, formatCents, formatPercent } from "@/lib/poc-report"
import { Card } from "@/components/ui/card"

export function ReportSummary({ report }: { report: RestaurantPocReport }) {
  const cards = [
    { label: "总收入", value: `¥${formatCents(report.totalIncome)}`, color: "text-green-600" },
    { label: "总成本", value: `¥${formatCents(report.totalCost)}`, color: "text-red-600" },
    { label: "毛利润", value: `¥${formatCents(report.grossProfit)}`, color: report.grossProfit >= 0 ? "text-green-600" : "text-red-600" },
    { label: "毛利率", value: formatPercent(report.grossMargin), color: report.grossMargin >= 0 ? "text-green-600" : "text-red-600" },
  ]

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">经营汇总</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label} className="p-4">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </Card>
        ))}
      </div>

      {report.costByCategory.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-md font-semibold">分类成本明细</h4>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3">分类</th>
                  <th className="text-right p-3">金额</th>
                  <th className="text-right p-3">占总成本</th>
                </tr>
              </thead>
              <tbody>
                {report.costByCategory.map((cat) => (
                  <tr key={cat.categoryCode} className="border-b last:border-0">
                    <td className="p-3">{cat.name}</td>
                    <td className="text-right p-3">¥{formatCents(cat.amount)}</td>
                    <td className="text-right p-3">
                      {report.totalCost > 0 ? formatPercent(cat.amount / report.totalCost) : "0%"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">本结果为经营毛利润参考值</p>
    </div>
  )
}
