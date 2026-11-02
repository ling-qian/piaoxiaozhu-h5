"use server";

/**
 * AI 问账与自然语言记账的服务端动作。
 *
 * 两个接口都在 Worker 的 `/api/insights/*` 下，与小程序共用同一套实现——
 * 提示词只有一份，两边问同一个问题得到的答案才一致。
 */

import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@/lib/auth";

export interface AskResult {
  question: string;
  /** 模型把你的问题理解成了什么。展示出来便于用户发现问歪了 */
  interpretation: string;
  answer: string;
  timeRange: string;
  metric: string;
  dimension: string | null;
  rowCount: number;
  /** 今天还剩几次免费问账 */
  freeRemaining: number;
  /** 这次是否扣了积分 */
  charged: boolean;
}

/** 问一句关于账目的话 */
export async function ask(question: string): Promise<AskResult> {
  const session = await auth();
  if (!session?.user) throw new Error("请先登录");

  const q = question.trim();
  if (!q) throw new Error("问题不能为空");

  try {
    const d = await apiFetch<{
      question: string;
      interpretation: string;
      answer: string;
      time_range: string;
      metric: string;
      dimension: string | null;
      row_count: number;
      free_remaining: number;
      charged: boolean;
    }>("/api/insights/ask", { method: "POST", body: { question: q } });

    return {
      question: d.question,
      interpretation: d.interpretation,
      answer: d.answer,
      timeRange: d.time_range,
      metric: d.metric,
      dimension: d.dimension,
      rowCount: d.row_count,
      freeRemaining: d.free_remaining,
      charged: d.charged,
    };
  } catch (e) {
    if (e instanceof ApiError) throw new Error(e.message);
    throw new Error("这次没查出来，换个说法试试");
  }
}

export interface ParsedEntry {
  ok: boolean;
  direction: "out" | "income";
  amount: number | null;
  merchant: string;
  date: string | null;
  categoryL1: string;
  note: string;
  /** 模型判断缺了哪些必填项，前端据此标红 */
  missing: string[];
}

/** 把一句话解析成记账草稿。不入库，等用户确认后再调 createRecord */
export async function parseTextEntry(text: string): Promise<ParsedEntry> {
  const session = await auth();
  if (!session?.user) throw new Error("请先登录");

  const t = text.trim();
  if (!t) throw new Error("说点什么，比如「昨天买了两袋水泥 320」");

  try {
    const d = await apiFetch<{
      ok: boolean;
      direction: "out" | "income";
      amount: number | null;
      merchant: string;
      date: string | null;
      category_l1: string;
      note: string;
      missing: string[];
    }>("/api/insights/parse-text", { method: "POST", body: { text: t } });

    return {
      ok: d.ok,
      direction: d.direction,
      amount: d.amount,
      merchant: d.merchant,
      date: d.date,
      categoryL1: d.category_l1,
      note: d.note,
      missing: d.missing ?? [],
    };
  } catch (e) {
    if (e instanceof ApiError) throw new Error(e.message);
    throw new Error("这句话没读懂，换个说法试试");
  }
}
