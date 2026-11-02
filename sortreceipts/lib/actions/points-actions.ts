"use server";

/**
 * 积分与签到的服务端动作。
 *
 * 全部转调 Cloudflare Worker 的 `/api/points*` 系列。前端不直连后端，
 * 因为登录态在 httpOnly cookie 里，浏览器 JS 拿不到。
 */

import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@/lib/auth";

export interface PointsSummary {
  balance: number;
  checkedInToday: boolean;
  checkinReward: number;
  signupBonus: number;
  costs: { invoiceOcr: number; aiAnalysis: number };
}

export interface PointsLog {
  id: string;
  action: string;
  delta: number;
  reason: string | null;
  createdAt: string;
}

export interface CheckinCalendar {
  month: string;
  today: string;
  checkedDates: string[];
  todayCheckedIn: boolean;
  monthCount: number;
  streak: number;
  balance: number;
  reward: number;
}

async function requireLogin(): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");
}

/** 余额与今日签到状态。首页、「我的」页都要用 */
export async function getPoints(): Promise<PointsSummary> {
  await requireLogin();
  const d = await apiFetch<{
    balance: number;
    checked_in_today: boolean;
    checkin_reward: number;
    signup_bonus: number;
    costs: { invoice_ocr: number; ai_analysis: number };
  }>("/api/points");

  return {
    balance: d.balance,
    checkedInToday: d.checked_in_today,
    checkinReward: d.checkin_reward,
    signupBonus: d.signup_bonus,
    costs: { invoiceOcr: d.costs.invoice_ocr, aiAnalysis: d.costs.ai_analysis },
  };
}

/** 签到。今天已签过时后端返回 400，这里转成可读的一句话 */
export async function checkin(): Promise<{ balance: number; earned: number; message: string }> {
  await requireLogin();
  try {
    return await apiFetch<{ balance: number; earned: number; message: string }>(
      "/api/points/checkin",
      { method: "POST" },
    );
  } catch (e) {
    if (e instanceof ApiError) throw new Error(e.message);
    throw new Error("签到失败，请稍后重试");
  }
}

/** 积分流水 */
export async function getPointsLogs(limit = 30): Promise<{ items: PointsLog[]; total: number }> {
  await requireLogin();
  const d = await apiFetch<{
    items: { id: string; action: string; delta: number; reason: string | null; created_at: string }[];
    total: number;
  }>(`/api/points/logs?limit=${limit}`);

  return {
    total: d.total,
    items: d.items.map((i) => ({
      id: i.id,
      action: i.action,
      delta: i.delta,
      reason: i.reason,
      createdAt: i.created_at,
    })),
  };
}

/** 签到日历 */
export async function getCheckinCalendar(month?: string): Promise<CheckinCalendar> {
  await requireLogin();
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  const d = await apiFetch<{
    month: string;
    today: string;
    checked_dates: string[];
    today_checked_in: boolean;
    month_count: number;
    streak: number;
    balance: number;
    reward: number;
  }>(`/api/points/checkin/calendar${qs}`);

  return {
    month: d.month,
    today: d.today,
    checkedDates: d.checked_dates,
    todayCheckedIn: d.today_checked_in,
    monthCount: d.month_count,
    streak: d.streak,
    balance: d.balance,
    reward: d.reward,
  };
}

export interface PointPackage {
  code: string;
  name: string;
  points: number;
  /** 人民币标价（元） */
  priceCny: number;
  /** 美元标价（美元） */
  priceUsd: number;
}

/** 可购买的积分包。两个币种的标价都由后端给，前端只负责显示 */
export async function getPointPackages(): Promise<PointPackage[]> {
  const d = await apiFetch<{
    items: {
      code: string;
      name: string;
      points: number;
      price_cents_cny: number;
      price_cents_usd: number;
    }[];
  }>("/api/points/packages", { skipAuth: true });

  return d.items.map((p) => ({
    code: p.code,
    name: p.name,
    points: p.points,
    priceCny: p.price_cents_cny / 100,
    priceUsd: p.price_cents_usd / 100,
  }));
}
