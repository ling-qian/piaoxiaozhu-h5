import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { ColoredText } from "@/components/ui/colored-text"
import config from "@/lib/config"
import { Mail } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

export default async function ChoosePlanPage() {
  if (config.selfHosted.isEnabled) {
    redirect(config.selfHosted.redirectUrl)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="w-full max-w-4xl mx-auto p-8 flex flex-col items-center justify-center gap-8">
        <CardTitle className="text-4xl font-bold text-center">
          <ColoredText>票小猪云端版</ColoredText>
          <h2 className="mt-3 text-2xl font-semibold text-muted-foreground">云端方案暂未开放</h2>
        </CardTitle>
        <CardContent className="p-0 w-full">
          <div className="text-center text-md text-muted-foreground">
            云端方案暂未开放。请使用自托管版本，或联系我们咨询。
          </div>
        </CardContent>

        <div className="text-center text-muted-foreground">
          <Link
            href={`mailto:${config.app.supportEmail}`}
            className="flex flex-row gap-1 items-center hover:text-primary transition-colors underline"
          >
            <Mail className="w-4 h-4" />
            联系我们了解定制方案
          </Link>
        </div>
      </Card>
    </div>
  )
}
