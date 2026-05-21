"use client"

import { saveManualIncomeAction } from "@/app/(app)/poc/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useNotification } from "@/app/(app)/context"
import { Loader2 } from "lucide-react"
import { startTransition, useActionState, useEffect, useState } from "react"

export function ManualIncomeForm({
  defaultMonth,
  defaultAmount,
}: {
  defaultMonth: string
  defaultAmount?: number | null
}) {
  const { showNotification } = useNotification()
  const [month, setMonth] = useState(defaultMonth)
  const [amount, setAmount] = useState(defaultAmount ? (defaultAmount / 100).toString() : "")
  const [state, formAction, isPending] = useActionState(saveManualIncomeAction, null)

  const handleSubmit = (formData: FormData) => {
    startTransition(() => {
      formAction(formData)
    })
  }

  useEffect(() => {
    if (state?.success) {
      showNotification({ code: "global.banner", message: "营业额已保存", type: "success" })
    }
  }, [state, showNotification])

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">录入本月营业额</h3>
      <p className="text-sm text-muted-foreground">先输入本月总收入，系统会自动计算毛利润</p>
      <form action={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">月份</label>
          <Input type="month" name="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">营业额（元）</label>
          <Input
            type="number"
            name="amount"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50000"
            required
            className="w-40"
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          保存
        </Button>
      </form>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </div>
  )
}
