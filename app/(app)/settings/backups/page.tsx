"use client"

import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useDownload } from "@/hooks/use-download"
import { useProgress } from "@/hooks/use-progress"
import { Download, Loader2 } from "lucide-react"
import { useActionState } from "react"
import { restoreBackupAction } from "./actions"

export default function BackupSettingsPage() {
  const [restoreState, restoreBackup, restorePending] = useActionState(restoreBackupAction, null)

  const { isLoading, startProgress, progress } = useProgress({
    onError: (error) => {
      console.error("Backup progress error:", error)
    },
  })

  const { download, isDownloading } = useDownload({
    onError: (error) => {
      console.error("Download error:", error)
    },
  })

  const handleDownload = async () => {
    try {
      const progressId = await startProgress("backup")
      const downloadUrl = `/settings/backups/data?progressId=${progressId || ""}`
      await download(downloadUrl, "taxhacker-backup.zip")
    } catch (error) {
      console.error("Failed to start backup:", error)
    }
  }

  return (
    <div className="container flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">下载备份</h1>
        <div className="flex flex-row gap-4">
          <Button onClick={handleDownload} disabled={isLoading || isDownloading}>
            {isLoading ? (
              progress?.current ? (
                `正在归档 ${progress.current}/${progress.total} 个文件`
              ) : (
                "正在准备备份，请勿关闭页面..."
              )
            ) : isDownloading ? (
              "归档已创建，正在下载..."
            ) : (
              <>
                <Download className="mr-2" /> 下载数据归档
              </>
            )}
          </Button>
        </div>
        <div className="text-sm text-muted-foreground max-w-xl">
          归档中包含所有上传的文件，以及交易、分类、项目、字段、货币和设置的 JSON 文件。您可以查看、编辑或将数据迁移到其他服务。
        </div>
      </div>

      <Card className="flex flex-col gap-2 mt-16 p-5 bg-red-100 max-w-xl">
        <h2 className="text-xl font-semibold">从备份恢复</h2>
        <p className="text-sm text-muted-foreground">
          ⚠️ 此操作不可逆。从备份恢复将删除当前数据库中的所有现有数据，并移除所有上传的文件。请谨慎操作，务必先备份！
        </p>
        <form action={restoreBackup}>
          <div className="flex flex-col gap-4 pt-4">
            <label>
              <input type="file" name="file" required />
            </label>
            <label className="flex flex-row gap-2 items-center">
              <input type="checkbox" name="removeExistingData" required />
              <span className="text-red-500">我了解此操作将永久删除所有现有数据</span>
            </label>
            <Button type="submit" variant="destructive" disabled={restorePending}>
              {restorePending ? (
                <>
                  <Loader2 className="animate-spin" /> 正在从备份恢复...（可能需要一些时间）
                </>
              ) : (
                "从备份恢复"
              )}
            </Button>
          </div>
        </form>
        {restoreState?.error && <FormError>{restoreState.error}</FormError>}
      </Card>

      {restoreState?.success && (
        <Card className="flex flex-col gap-2 p-5 bg-green-100 max-w-xl">
          <h2 className="text-xl font-semibold">备份恢复成功</h2>
          <p className="text-sm text-muted-foreground">您现在可以继续使用应用。导入统计：</p>
          <ul className="list-disc list-inside">
            {Object.entries(restoreState.data?.counters || {}).map(([key, value]) => (
              <li key={key}>
                <span className="font-bold">{key}</span>：{value} 条
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
