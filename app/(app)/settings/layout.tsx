import { SideNav } from "@/components/settings/side-nav"
import { Separator } from "@/components/ui/separator"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "设置",
  description: "在此自定义您的设置",
}

const settingsCategories = [
  {
    title: "通用",
    href: "/settings",
  },
  {
    title: "个人资料与套餐",
    href: "/settings/profile",
  },
  {
    title: "企业信息",
    href: "/settings/business",
  },
  {
    title: "LLM 设置",
    href: "/settings/llm",
  },
  {
    title: "字段",
    href: "/settings/fields",
  },
  {
    title: "分类",
    href: "/settings/categories",
  },
  {
    title: "项目",
    href: "/settings/projects",
  },
  {
    title: "货币",
    href: "/settings/currencies",
  },
  {
    title: "备份",
    href: "/settings/backups",
  },
  {
    title: "危险区域",
    href: "/settings/danger",
  },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="space-y-6 p-10 pb-16">
        <div className="space-y-0.5">
          <h2 className="text-2xl font-bold tracking-tight">设置</h2>
          <p className="text-muted-foreground">在此自定义您的设置</p>
        </div>
        <Separator className="my-6" />
        <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
          <aside className="-mx-4 lg:w-1/5">
            <SideNav items={settingsCategories} />
          </aside>
          <div className="flex w-full">{children}</div>
        </div>
      </div>
    </>
  )
}
