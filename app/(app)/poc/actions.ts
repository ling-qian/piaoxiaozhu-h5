"use server"

import { getCurrentUser } from "@/lib/auth"
import { buildRestaurantPocReport, RestaurantPocReport } from "@/lib/poc-report"
import { getSettings } from "@/models/settings"
import { createTransaction, getTransactionsByMonth, updateTransaction } from "@/models/transactions"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"

const MANUAL_INCOME_MERCHANT = "手工录入"
const MANUAL_INCOME_NAME = "月营业额"
const MANUAL_INCOME_NOTE = "POC manual income"

export async function saveManualIncomeAction(_prevState: { success: boolean; error?: string } | null, formData: FormData) {
  try {
    const user = await getCurrentUser()
    const month = formData.get("month") as string
    const amountStr = formData.get("amount") as string

    if (!month || !amountStr) {
      return { success: false, error: "请填写月份和金额" }
    }

    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount < 0) {
      return { success: false, error: "金额无效" }
    }

    const settings = await getSettings(user.id)
    const amountInCents = Math.round(amount * 100)

    const existing = await prisma.transaction.findFirst({
      where: {
        userId: user.id,
        merchant: MANUAL_INCOME_MERCHANT,
        name: MANUAL_INCOME_NAME,
        note: MANUAL_INCOME_NOTE,
        issuedAt: {
          gte: new Date(`${month}-01`),
          lt: new Date(month.startsWith("12") ? `${parseInt(month.slice(0, 4)) + 1}-01` : `${month.slice(0, 4)}-${(parseInt(month.slice(5, 7)) + 1).toString().padStart(2, "0")}-01`),
        },
      },
    })

    if (existing) {
      await updateTransaction(existing.id, user.id, {
        total: amountInCents,
        currencyCode: settings.default_currency || "CNY",
        type: "income",
        issuedAt: new Date(`${month}-01`),
      })
    } else {
      await createTransaction(user.id, {
        name: MANUAL_INCOME_NAME,
        merchant: MANUAL_INCOME_MERCHANT,
        total: amountInCents,
        currencyCode: settings.default_currency || "CNY",
        type: "income",
        issuedAt: new Date(`${month}-01`),
        note: MANUAL_INCOME_NOTE,
        categoryCode: null,
        projectCode: settings.default_project || null,
      })
    }

    revalidatePath("/poc")
    return { success: true }
  } catch (error) {
    console.error("Failed to save manual income:", error)
    return { success: false, error: "保存失败" }
  }
}

export async function getPocReportAction(month: string): Promise<RestaurantPocReport | null> {
  try {
    const user = await getCurrentUser()
    const transactions = await getTransactionsByMonth(user.id, month)
    return buildRestaurantPocReport(transactions)
  } catch (error) {
    console.error("Failed to get POC report:", error)
    return null
  }
}

export async function getManualIncomeAction(month: string): Promise<number | null> {
  try {
    const user = await getCurrentUser()
    const existing = await prisma.transaction.findFirst({
      where: {
        userId: user.id,
        merchant: MANUAL_INCOME_MERCHANT,
        name: MANUAL_INCOME_NAME,
        note: MANUAL_INCOME_NOTE,
        issuedAt: {
          gte: new Date(`${month}-01`),
          lt: new Date(month.startsWith("12") ? `${parseInt(month.slice(0, 4)) + 1}-01` : `${month.slice(0, 4)}-${(parseInt(month.slice(5, 7)) + 1).toString().padStart(2, "0")}-01`),
        },
      },
    })
    return existing?.total ?? null
  } catch {
    return null
  }
}
