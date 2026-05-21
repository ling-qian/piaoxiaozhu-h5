"use client"

import { DateRangePicker } from "@/components/forms/date-range-picker"
import { FormSelectCategory } from "@/components/forms/select-category"
import { FormSelectProject } from "@/components/forms/select-project"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useDownload } from "@/hooks/use-download"
import { useProgress } from "@/hooks/use-progress"
import { useTransactionFilters } from "@/hooks/use-transaction-filters"
import { Category, Field, Project } from "@/prisma/client"
import { formatDate } from "date-fns"
import { useState } from "react"

const deselectedFields = ["files", "text"]

export function ExportTransactionsDialog({
  fields,
  categories,
  projects,
  total,
  children,
}: {
  fields: Field[]
  categories: Category[]
  projects: Project[]
  total: number
  children: React.ReactNode
}) {
  const [exportFilters, setExportFilters] = useTransactionFilters()
  const [exportFields, setExportFields] = useState<string[]>(
    fields.map((field) => (deselectedFields.includes(field.code) ? "" : field.code))
  )
  const [includeAttachments, setIncludeAttachments] = useState(true)
  const { isLoading, startProgress, progress } = useProgress({
    onError: (error) => {
      console.error("Export progress error:", error)
    },
  })

  const { download, isDownloading } = useDownload({
    onError: (error) => {
      console.error("Download error:", error)
    },
  })

  const handleSubmit = async () => {
    try {
      const progressId = await startProgress("transactions-export")

      const exportUrl = `/export/transactions?${new URLSearchParams({
        search: exportFilters?.search || "",
        dateFrom: exportFilters?.dateFrom || "",
        dateTo: exportFilters?.dateTo || "",
        ordering: exportFilters?.ordering || "",
        categoryCode: exportFilters?.categoryCode || "",
        projectCode: exportFilters?.projectCode || "",
        fields: exportFields.join(","),
        includeAttachments: includeAttachments.toString(),
        progressId: progressId || "",
      }).toString()}`
      await download(exportUrl, "transactions.zip")
    } catch (error) {
      console.error("Failed to start export:", error)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">{children}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">导出 {total} 条交易</DialogTitle>
          <DialogDescription>将选中的交易和文件导出为 CSV 文件或 ZIP 压缩包</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            {exportFilters.search && (
              <div className="flex flex-row items-center gap-2">
                <span className="text-sm font-medium">搜索关键词：</span>
                <span className="text-sm">{exportFilters.search}</span>
              </div>
            )}

            <div className="flex flex-row items-center gap-2">
              <span className="text-sm font-medium">时间范围：</span>

              <DateRangePicker
                defaultDate={{
                  from: exportFilters?.dateFrom ? new Date(exportFilters.dateFrom) : undefined,
                  to: exportFilters?.dateTo ? new Date(exportFilters.dateTo) : undefined,
                }}
                defaultRange="all-time"
                onChange={(date) => {
                  setExportFilters({
                    ...exportFilters,
                    dateFrom: date?.from ? formatDate(date.from, "yyyy-MM-dd") : undefined,
                    dateTo: date?.to ? formatDate(date.to, "yyyy-MM-dd") : undefined,
                  })
                }}
              />
            </div>

            <div className="flex flex-row items-center gap-2">
              <FormSelectCategory
                title="分类"
                name="category"
                categories={categories}
                value={exportFilters.categoryCode}
                onValueChange={(value) => setExportFilters({ ...exportFilters, categoryCode: value })}
                placeholder="全部分类"
                emptyValue="全部分类"
              />

              <FormSelectProject
                title="项目"
                name="project"
                projects={projects}
                value={exportFilters.projectCode}
                onValueChange={(value) => setExportFilters({ ...exportFilters, projectCode: value })}
                placeholder="全部项目"
                emptyValue="全部项目"
              />
            </div>
          </div>

          <Separator />

          <div className="text-lg font-bold">CSV 中包含的字段</div>

          <div className="grid grid-cols-2 gap-2">
            {fields.map((field) => (
              <div key={field.code} className="inline-flex gap-2">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    name={field.code}
                    checked={exportFields.includes(field.code)}
                    onChange={(e) =>
                      setExportFields(
                        e.target.checked ? [...exportFields, field.code] : exportFields.filter((f) => f !== field.code)
                      )
                    }
                  />
                  <span>{field.name}</span>
                </label>
              </div>
            ))}
          </div>
          <Separator />
          <div>
            <label className="flex items-center gap-3 text-lg">
              <input
                type="checkbox"
                name="attachments"
                className="h-[20px] w-[20px]"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
              />
              <span className="flex flex-col">
                <span className="font-medium">包含附件文件</span>
                <span className="text-sm">（创建 ZIP 压缩包）</span>
              </span>
            </label>
          </div>
        </div>
        <DialogFooter className="sm:justify-end">
          <Button type="button" onClick={handleSubmit} disabled={isLoading || isDownloading}>
            {isLoading
              ? progress?.current
                ? `打包中 ${progress.current}/${progress.total} 个文件`
                : "导出中..."
              : isDownloading
                ? "压缩包已创建，正在下载..."
                : "导出交易"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
