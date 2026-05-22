import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import { ColoredText } from "@/components/ui/colored-text"
import { getCurrentUser } from "@/lib/auth"
import { getSettings, updateSettings } from "@/models/settings"
import { Banknote, ChartBarStacked, FolderOpenDot, Key, TextCursorInput, X } from "lucide-react"
import { revalidatePath } from "next/cache"
import Image from "next/image"
import Link from "next/link"

export async function WelcomeWidget() {
  const user = await getCurrentUser()
  const settings = await getSettings(user.id)

  return (
    <Card className="flex flex-col lg:flex-row items-start gap-10 p-10 w-full">
      <Image src="/logo/1024.png" alt="Logo" width={256} height={256} className="w-64 h-64" />
      <div className="flex flex-col">
        <CardTitle className="flex items-center justify-between">
          <span className="text-2xl font-bold">
            <ColoredText>你好，我是票小助 👋</ColoredText>
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={async () => {
              "use server"
              await updateSettings(user.id, "is_welcome_message_hidden", "true")
              revalidatePath("/")
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
        <CardDescription className="mt-5">
          <p className="mb-3">
            我是一个小会计应用，帮你用AI处理无尽的收据、支票和发票。以下是我能做的事情：
          </p>
          <ul className="mb-5 list-disc pl-5 space-y-1">
            <li>
              <strong>上传照片或PDF</strong>，我会识别、分类并将其保存为交易记录，供你的税务顾问使用。
            </li>
            <li>
              我可以<strong>自动转换货币</strong>，并查询指定日期的汇率。
            </li>
            <li>
              我甚至<strong>支持加密货币！</strong>包括质押的历史汇率。
            </li>
            <li>
              所有<strong>LLM提示词均可配置</strong>：字段、分类和项目都可以自定义。你可以在设置中随意修改。
            </li>
            <li>
              数据保存在<strong>本地SQLite数据库</strong>中，可以导出为CSV和ZIP压缩包。
            </li>
            <li>
              你甚至可以<strong>创建自定义字段</strong>进行分析，这些字段将包含在为税务顾问导出的CSV中。
            </li>
            <li>
              我还<strong>很年轻</strong>，可能会犯错。使用风险自负！
            </li>
          </ul>
          <p className="mb-3">
            虽然我可以帮你在分类交易和生成报告方面节省大量时间，但我仍然强烈建议在报税时将结果交给专业税务顾问审核！
          </p>
        </CardDescription>
        <div className="mt-2">
          <Link href="https://github.com/vas3k/TaxHacker" className="text-blue-500 hover:underline">
            源代码
          </Link>
          <span className="mx-2">|</span>
          <Link href="https://github.com/vas3k/TaxHacker/issues" className="text-blue-500 hover:underline">
            请求新功能
          </Link>
          <span className="mx-2">|</span>
          <Link href="https://github.com/vas3k/TaxHacker/issues" className="text-blue-500 hover:underline">
            报告Bug
          </Link>
          <span className="mx-2">|</span>
          <Link href="mailto:me@vas3k.ru" className="text-blue-500 hover:underline">
            联系作者
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 mt-8">
          {settings.openai_api_key === "" && (
            <Link href="/settings/llm">
              <Button>
                <Key className="h-4 w-4" />
                请在此提供您的ChatGPT密钥
              </Button>
            </Link>
          )}
          <Link href="/settings">
            <Button variant="outline">
              <Banknote className="h-4 w-4" />
              默认货币：{settings.default_currency}
            </Button>
          </Link>
          <Link href="/settings/categories">
            <Button variant="outline">
              <ChartBarStacked className="h-4 w-4" />
              分类
            </Button>
          </Link>
          <Link href="/settings/projects">
            <Button variant="outline">
              <FolderOpenDot className="h-4 w-4" />
              项目
            </Button>
          </Link>
          <Link href="/settings/fields">
            <Button variant="outline">
              <TextCursorInput className="h-4 w-4" />
              自定义字段
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  )
}
