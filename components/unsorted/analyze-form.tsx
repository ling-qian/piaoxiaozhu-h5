"use client"

import { useNotification } from "@/app/(app)/context"
import { analyzeFileAction, deleteUnsortedFileAction, saveFileAsTransactionAction } from "@/app/(app)/unsorted/actions"
import { ItemsDetectTool } from "@/components/agents/items-detect"
import ToolWindow from "@/components/agents/tool-window"
import { FormError } from "@/components/forms/error"
import { FormSelectCategory } from "@/components/forms/select-category"
import { FormInput, FormTextarea } from "@/components/forms/simple"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Category, Field, File, Project } from "@/prisma/client"
import { ArrowDownToLine, Brain, Loader2, Trash2 } from "lucide-react"
import { startTransition, useActionState, useMemo, useState } from "react"
import { DuplicateModal } from "../transactions/duplicate-modal"
import { ActionState } from "@/lib/actions"
import { Transaction } from "@/prisma/client"
import { deleteTransactionAction } from "@/app/(app)/transactions/actions"

export default function AnalyzeForm({
  file,
  categories,
  projects,
  fields,
  settings,
}: {
  file: File
  categories: Category[]
  projects: Project[]
  fields: Field[]
  settings: Record<string, string>
}) {
  const { showNotification } = useNotification()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeStep, setAnalyzeStep] = useState<string>("")
  const [analyzeError, setAnalyzeError] = useState<string>("")
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteUnsortedFileAction, null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false)
  const [duplicateData, setDuplicateData] = useState<ActionState<Transaction>["duplicateData"] | null>(null)
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null)

  const POC_FIELD_ORDER = ["merchant", "issuedAt", "total", "taxAmount", "categoryCode", "note"]

  const fieldMap = useMemo(() => {
    return fields.reduce(
      (acc, field) => {
        acc[field.code] = field
        return acc
      },
      {} as Record<string, Field>
    )
  }, [fields])

  const extraFields = useMemo(() => fields.filter((field) => field.isExtra), [fields])
  const initialFormState = useMemo(() => {
    const baseState = {
      name: file.filename,
      merchant: "",
      description: "",
      type: settings.default_type,
      total: 0.0,
      currencyCode: settings.default_currency,
      convertedTotal: 0.0,
      convertedCurrencyCode: settings.default_currency,
      categoryCode: settings.default_category,
      projectCode: settings.default_project,
      issuedAt: "",
      note: "",
      text: "",
      items: [],
      taxAmount: "",
    }

    // Add extra fields
    const extraFieldsState = extraFields.reduce(
      (acc, field) => {
        acc[field.code] = ""
        return acc
      },
      {} as Record<string, string>
    )

    // Load cached results if they exist
    const cachedResults = file.cachedParseResult
      ? Object.fromEntries(
          Object.entries(file.cachedParseResult as Record<string, string>).filter(
            ([_, value]) => value !== null && value !== undefined && value !== ""
          )
        )
      : {}

    return {
      ...baseState,
      ...extraFieldsState,
      ...cachedResults,
    }
  }, [file.filename, settings, extraFields, file.cachedParseResult])
  const [formData, setFormData] = useState(initialFormState)

  const isRuleClassified = formData.note?.startsWith("规则分类：")

  async function saveAsTransaction(formData: FormData) {
    setSaveError("")
    setIsSaving(true)
    startTransition(async () => {
      const result = await saveFileAsTransactionAction(null, formData)
      setIsSaving(false)

      if (result.success) {
        showNotification({ code: "global.banner", message: "已保存！", type: "success" })
        showNotification({ code: "sidebar.transactions", message: "new" })
        setTimeout(() => showNotification({ code: "sidebar.transactions", message: "" }), 3000)
      } else if (result.error === "DUPLICATE_FOUND" && result.duplicateData) {
        setDuplicateData(result.duplicateData)
        setPendingFormData(formData) // Save the form data so we can retry later
        setIsDuplicateModalOpen(true)
      } else {
        setSaveError(result.error ? result.error : "出错了...")
        showNotification({ code: "global.banner", message: "保存失败", type: "failed" })
      }
    })
  }

  const handleForceSave = () => {
    if (!pendingFormData) return

    setIsDuplicateModalOpen(false)

    const newFormData = new FormData()
    for (const [key, value] of pendingFormData.entries()) {
      newFormData.append(key, value)
    }
    newFormData.append("forceSave", "true")

    saveAsTransaction(newFormData)
  }

  const handleCancelDuplicate = () => {
    setIsDuplicateModalOpen(false)
    setPendingFormData(null)
    setDuplicateData(null)
  }
  const handleReplaceOld = async () => {
    if (!duplicateData || !pendingFormData) return

    setIsDuplicateModalOpen(false)
    setIsSaving(true)

    try {
      await deleteTransactionAction(null, duplicateData.existingTransaction.id)

      await saveAsTransaction(pendingFormData)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to replace transaction")
    } finally {
      setIsSaving(false)
    }
  }

  const startAnalyze = async () => {
    setIsAnalyzing(true)
    setAnalyzeError("")
    try {
      setAnalyzeStep("识别中...")
      const results = await analyzeFileAction(file, settings, fields, categories, projects)

      console.log("Analysis results:", results)

      if (!results.success) {
        setAnalyzeError(results.error ? results.error : "出错了...")
      } else {
        const nonEmptyFields = Object.fromEntries(
          Object.entries(results.data?.output || {}).filter(
            ([_, value]) => value !== null && value !== undefined && value !== ""
          )
        )
        setFormData({ ...formData, ...nonEmptyFields })
      }
    } catch (error) {
      console.error("Analysis failed:", error)
      setAnalyzeError(error instanceof Error ? error.message : "Analysis failed")
    } finally {
      setIsAnalyzing(false)
      setAnalyzeStep("")
    }
  }

  return (
    <>
      {file.isSplitted ? (
        <div className="flex justify-end">
          <Badge variant="outline">此文件已拆分</Badge>
        </div>
      ) : (
        <Button className="w-full mb-6 py-6 text-lg" onClick={startAnalyze} disabled={isAnalyzing} data-analyze-button>
          {isAnalyzing ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              <span>{analyzeStep}</span>
            </>
          ) : (
            <>
              <Brain className="mr-1 h-4 w-4" />
              <span>AI 识别</span>
            </>
          )}
        </Button>
      )}

      <div>{analyzeError && <FormError>{analyzeError}</FormError>}</div>

      <form className="space-y-4" action={saveAsTransaction}>
        <input type="hidden" name="fileId" value={file.id} />
        <input type="hidden" name="name" value={formData.name} />
        <input type="hidden" name="currencyCode" value={formData.currencyCode} />
        <input type="hidden" name="type" value={formData.type} />
        <input type="hidden" name="projectCode" value={formData.projectCode} />

        <FormInput
          title={fieldMap.merchant?.name || "商户名称"}
          name="merchant"
          value={formData.merchant}
          onChange={(e) => setFormData((prev) => ({ ...prev, merchant: e.target.value }))}
          required={fieldMap.merchant?.isRequired}
        />

        <FormInput
          title={fieldMap.issuedAt?.name || "日期"}
          type="date"
          name="issuedAt"
          value={formData.issuedAt}
          onChange={(e) => setFormData((prev) => ({ ...prev, issuedAt: e.target.value }))}
          required={fieldMap.issuedAt?.isRequired}
        />

        <div className="flex flex-wrap gap-4">
          <FormInput
            title={fieldMap.total?.name || "金额"}
            name="total"
            type="number"
            step="0.01"
            value={formData.total || ""}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value || "0")
              if (!isNaN(newValue)) {
                setFormData((prev) => ({ ...prev, total: newValue }))
              }
            }}
            className="w-32"
            required={fieldMap.total?.isRequired}
          />

          {fieldMap.taxAmount && (
            <FormInput
              title={fieldMap.taxAmount.name}
              name="taxAmount"
              type="number"
              step="0.01"
              value={formData.taxAmount || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, taxAmount: e.target.value }))}
              className="w-32"
              hideIfEmpty={!fieldMap.taxAmount.isVisibleInAnalysis}
              required={fieldMap.taxAmount.isRequired}
            />
          )}
        </div>

        <div className="flex flex-row gap-4 items-start">
          <div className="flex-1">
            <FormSelectCategory
              title={fieldMap.categoryCode?.name || "分类"}
              categories={categories}
              name="categoryCode"
              value={formData.categoryCode}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, categoryCode: value }))}
              placeholder="选择分类"
              required={fieldMap.categoryCode?.isRequired}
            />
          </div>
        </div>
        {isRuleClassified && (
          <p className="text-xs text-muted-foreground -mt-2">已按规则自动分类，可手动修改</p>
        )}

        <FormInput
          title={fieldMap.note?.name || "备注"}
          name="note"
          value={formData.note}
          onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
          hideIfEmpty={!fieldMap.note?.isVisibleInAnalysis}
          required={fieldMap.note?.isRequired}
        />

        {extraFields
          .filter((field) => !POC_FIELD_ORDER.includes(field.code))
          .map((field) => (
            <FormInput
              key={field.code}
              type="text"
              title={field.name}
              name={field.code}
              value={formData[field.code as keyof typeof formData]}
              onChange={(e) => setFormData((prev) => ({ ...prev, [field.code]: e.target.value }))}
              hideIfEmpty={!field.isVisibleInAnalysis}
              required={field.isRequired}
            />
          ))}

        {formData.items && formData.items.length > 0 && (
          <ToolWindow title="识别到的项目">
            <ItemsDetectTool file={file} data={formData} />
          </ToolWindow>
        )}

        <div className="hidden">
          <input type="text" name="items" value={JSON.stringify(formData.items)} readOnly />
          <FormTextarea
            title={fieldMap.text?.name || "识别文本"}
            name="text"
            value={formData.text}
            onChange={(e) => setFormData((prev) => ({ ...prev, text: e.target.value }))}
          />
        </div>

        <div className="flex justify-between gap-4 pt-6">
          <Button
            type="button"
            onClick={() => startTransition(() => deleteAction(file.id))}
            variant="destructive"
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? "⏳ 删除中..." : "删除"}
          </Button>

          <Button type="submit" disabled={isSaving} data-save-button>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <ArrowDownToLine className="h-4 w-4" />
                保存为交易
              </>
            )}
          </Button>
        </div>

        <div>
          {deleteState?.error && <FormError>{deleteState.error}</FormError>}
          {saveError && <FormError>{saveError}</FormError>}
        </div>
      </form>
      <DuplicateModal
        isOpen={isDuplicateModalOpen}
        onOpenChange={setIsDuplicateModalOpen}
        duplicateData={duplicateData}
        onKeepBoth={handleForceSave} // This should trigger the action again with forceSave: true
        onReplaceOld={handleReplaceOld}
        onCancel={handleCancelDuplicate} // This should just close the modal
      />
    </>
  )
}
