import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { resetFieldsAndCategories, resetLLMSettings } from "./actions"

export default async function DangerSettingsPage() {
  const user = await getCurrentUser()

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2 text-red-500">危险区域</h1>
      <p className="text-sm text-red-400 mb-8 max-w-prose">
        此处的设置将覆盖您现有的字段、分类和提示词。仅在出现问题时使用。
      </p>
      <div className="space-y-10">
        <div className="space-y-2">
          <h3 className="text-lg font-bold">LLM 设置</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-prose">
            这将把系统提示词和其他 LLM 设置重置为默认值
          </p>
          <form
            action={async () => {
              "use server"
              await resetLLMSettings(user)
            }}
          >
            <Button variant="destructive" type="submit">
              重置主 LLM 提示词
            </Button>
          </form>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold">字段、货币和分类</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-prose">
            这将把所有字段、货币和分类重置为默认值
          </p>
          <form
            action={async () => {
              "use server"
              await resetFieldsAndCategories(user)
            }}
          >
            <Button variant="destructive" type="submit">
              重置字段、货币和分类
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
