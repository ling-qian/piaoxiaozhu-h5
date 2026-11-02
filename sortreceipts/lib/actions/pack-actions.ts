"use server";

/**
 * 月度会计交付包的数据操作。
 *
 * 汇总与异常都由后端算好，前端只负责展示与两个动作：下载 CSV、生成分享链接。
 * 数字一律不让前端重算，否则页面和分享页的口径会分叉。
 */

import { apiFetch, apiFetchText } from "@/lib/api";
import { auth } from "@/lib/auth";

export interface PackSummary {
  record_count: number;
  income: number;
  expense: number;
  net: number;
  tax_total: number;
}

export interface PackCategory {
  name: string;
  amount: number;
  count: number;
  share: number;
}

export interface PackEvidence {
  id: string;
  date: string;
  merchant: string | null;
  amount: number;
  invoice_no: string | null;
}

export type ExceptionCode =
  | "duplicate_invoice_no"
  | "missing_invoice"
  | "amount_outlier"
  | "missing_date";

export interface PackException {
  code: ExceptionCode;
  severity: "high" | "medium" | "low";
  count: number;
  amount: number;
  label: string | null;
  ratio: number;
  records: PackEvidence[];
}

export interface PackPayload {
  month: string;
  summary: PackSummary;
  categories: PackCategory[];
  exceptions: PackException[];
  generated_at: string;
}

export interface PackShare {
  token: string;
  path: string;
  shared_at: string;
}

export interface PackResult extends PackPayload {
  /** 抬头用的商户名 */
  project_name: string;
  share: PackShare | null;
}

export interface SharedPack {
  project_name: string;
  shared_at: string;
  pack: PackPayload;
}

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");
}

/** 取某个月的交付包；月份由调用方校验成 YYYY-MM */
export async function getPack(projectId: string, month: string): Promise<PackResult> {
  await requireUser();
  return apiFetch<PackResult>(`/api/projects/${projectId}/pack?month=${month}`);
}

/** 取 CSV 原文。下载动作在浏览器里做，服务端只负责把文本取回来 */
export async function getPackCsv(projectId: string, month: string): Promise<string> {
  await requireUser();
  return apiFetchText(`/api/projects/${projectId}/pack/csv?month=${month}`);
}

/**
 * 生成或刷新分享快照。
 *
 * 同一项目同一个月重复点分享时，后端复用已有令牌并更新快照内容，
 * 用户已经发给会计的链接不会失效。
 */
export async function createPackShare(projectId: string, month: string): Promise<PackShare> {
  await requireUser();
  return apiFetch<PackShare>(`/api/projects/${projectId}/pack/share`, {
    method: "POST",
    body: { month },
  });
}

/** 只读分享页用：令牌本身就是凭据，不带登录态 */
export async function getSharedPack(token: string): Promise<SharedPack> {
  return apiFetch<SharedPack>(`/api/share/${token}`, { skipAuth: true });
}
