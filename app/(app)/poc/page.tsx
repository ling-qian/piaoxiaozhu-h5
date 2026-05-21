import { ManualIncomeForm } from "@/components/poc/manual-income-form"
import { MonthPicker } from "@/components/poc/month-picker"
import { ReportSummary } from "@/components/poc/report-summary"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { getManualIncomeAction, getPocReportAction } from "@/app/(app)/poc/actions"
import { Download, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"

export default async function PocPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams
  const currentMonth = params.month || format(new Date(), "yyyy-MM")
  const user = await getCurrentUser()

  const report = await getPocReportAction(currentMonth)
  const manualIncome = await getManualIncomeAction(currentMonth)

  const [year, month] = currentMonth.split("-")
  const dateFrom = `${year}-${month}-01`
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
  const dateTo = `${year}-${month}-${lastDay}`
  const exportUrl = `/export/transactions?dateFrom=${dateFrom}&dateTo=${dateTo}&fields=issuedAt,merchant,total,taxAmount,categoryCode,note`

  return (
    <div className="flex flex-col gap-6 p-5 w-full max-w-4xl self-center">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">餐饮票据整理 POC</h2>
          <p className="text-sm text-muted-foreground">
            先去上传并识别本月成本票据，再回来输入本月营业额查看毛利润
          </p>
        </div>
      </div>

      <MonthPicker currentMonth={currentMonth} />

      <ManualIncomeForm defaultMonth={currentMonth} defaultAmount={manualIncome} />

      {report && (report.totalIncome > 0 || report.totalCost > 0) ? (
        <ReportSummary report={report} />
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>暂无数据</p>
          <p className="text-sm">请先上传票据或录入营业额</p>
        </div>
      )}

      <div className="flex gap-3">
        <Link href={exportUrl}>
          <Button variant="outline">
            <Download className="mr-1 h-4 w-4" />
            导出 CSV
          </Button>
        </Link>
        <Link href="/unsorted">
          <Button variant="outline">上传票据</Button>
        </Link>
      </div>
    </div>
  )
}
