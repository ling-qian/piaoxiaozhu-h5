import DashboardDropZoneWidget from "@/components/dashboard/drop-zone-widget"
import { StatsWidget } from "@/components/dashboard/stats-widget"
import DashboardUnsortedWidget from "@/components/dashboard/unsorted-widget"
import { WelcomeWidget } from "@/components/dashboard/welcome-widget"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { getUnsortedFiles } from "@/models/files"
import { getSettings } from "@/models/settings"
import { TransactionFilters } from "@/models/transactions"
import { Metadata } from "next"
import Link from "next/link"
import { UtensilsCrossed } from "lucide-react"

export const metadata: Metadata = {
  title: "首页",
  description: config.app.description,
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<TransactionFilters> }) {
  const filters = await searchParams
  const user = await getCurrentUser()
  const unsortedFiles = await getUnsortedFiles(user.id)
  const settings = await getSettings(user.id)

  return (
    <div className="flex flex-col gap-5 p-5 w-full max-w-7xl self-center">
      <Link href="/poc">
        <Card className="p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors cursor-pointer">
          <UtensilsCrossed className="h-6 w-6 text-orange-500" />
          <div>
            <p className="font-semibold">餐饮票据整理 POC</p>
            <p className="text-sm text-muted-foreground">录入营业额、查看毛利润、导出报表</p>
          </div>
        </Card>
      </Link>

      <div className="flex flex-col sm:flex-row gap-5 items-stretch h-full">
        <DashboardDropZoneWidget />

        <DashboardUnsortedWidget files={unsortedFiles} />
      </div>

      {settings.is_welcome_message_hidden !== "true" && <WelcomeWidget />}

      <Separator />

      <StatsWidget filters={filters} />
    </div>
  )
}
