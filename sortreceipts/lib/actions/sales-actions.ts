"use server";

/**
 * 营业额与毛利的数据操作。
 *
 * 支出由后端从票据表取，这里只负责读写「每天一行营业额」。
 * 前端不做减法，页面上的毛利与接口返回的必须是同一个数。
 */

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";
import { auth } from "@/lib/auth";

export interface SaleDay {
  date: string;
  amount: number;
  note: string | null;
  updated_at: string;
}

export interface SalesSummary {
  revenue: number;
  expense: number;
  gross_profit: number;
  margin: number;
  days_count: number;
}

export interface SalesResult {
  month: string;
  days: SaleDay[];
  summary: SalesSummary;
}

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");
}

export async function getSales(projectId: string, month: string): Promise<SalesResult> {
  await requireUser();
  return apiFetch<SalesResult>(`/api/projects/${projectId}/sales?month=${month}`);
}

/** 同一天重复提交会覆盖原值，不会新增一条 */
export async function saveSale(
  projectId: string,
  input: { date: string; amount: number; note?: string | null }
): Promise<{ date: string; amount: number; note: string | null }> {
  await requireUser();
  const saved = await apiFetch<{ date: string; amount: number; note: string | null }>(
    `/api/projects/${projectId}/sales`,
    { method: "POST", body: input }
  );
  revalidatePath("/sales");
  return saved;
}
