"use server";

/**
 * 用户相关数据操作（已从 Prisma 改为调 Worker 后端）。
 *
 * 函数名与返回形状保持兼容，页面 import 不变。
 * 差异说明：
 *   - 配额从「发票张数」改成「积分」（与小程序同一口径），
 *     所以 checkQuota 的返回含义是「积分余额 vs 套餐额度」，不是张数。
 */

import { apiFetch, setTokenCookie } from "@/lib/api";
import { auth } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerUser(email: string, password: string, name: string) {
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmedEmail)) throw new Error("邮箱格式不正确");
  if (password.length < 8) throw new Error("密码至少8位");
  if (!name.trim()) throw new Error("昵称不能为空");

  const data = await apiFetch<{ access_token: string; user: { id: string; email: string | null; nickname: string | null } }>(
    "/api/auth/email/register",
    { method: "POST", body: { email: trimmedEmail, password, nickname: name.trim() }, skipAuth: true },
  );
  // 注册后直接登录，不用用户再输一次密码
  await setTokenCookie(data.access_token);
  return { id: data.user.id, email: data.user.email, name: data.user.nickname };
}

export async function getUserInfo() {
  const session = await auth();
  if (!session?.user) return null;

  const [me, quota] = await Promise.all([
    apiFetch<{ id: string; email: string | null; nickname: string | null; avatar_url: string | null; created_at: string }>("/api/me"),
    apiFetch<{
      plan_code: string;
      plan_name: string;
      points_balance: number;
      points_used_this_month: number;
      can_export: boolean;
      plan_expires_at: string | null;
    }>("/api/me/quota"),
  ]);

  // 兼容原 Prisma 形状（页面读 planCode / quotaTotal / quotaUsed）
  return {
    id: me.id,
    email: me.email,
    name: me.nickname,
    avatarUrl: me.avatar_url,
    planCode: quota.plan_code,
    planName: quota.plan_name,
    quotaTotal: quota.points_balance + quota.points_used_this_month,
    quotaUsed: quota.points_used_this_month,
    pointsBalance: quota.points_balance,
    canExport: quota.can_export,
    planExpiresAt: quota.plan_expires_at,
    createdAt: me.created_at,
  };
}

export async function checkQuota(): Promise<{ used: number; total: number; available: boolean }> {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const quota = await apiFetch<{
    points_balance: number;
    points_used_this_month: number;
  }>("/api/me/quota");

  return {
    used: quota.points_used_this_month,
    total: quota.points_balance + quota.points_used_this_month,
    available: quota.points_balance > 0,
  };
}

export async function incrementQuotaUsed(): Promise<void> {
  // 扣费已由后端在各功能入口统一处理（问账/分析/OCR），
  // 前端再调一次会重复扣。这里明确成 no-op 并在注释里说明，
  // 比静默什么都不做更容易被后来的人理解。
  return;
}

export async function updateUserName(name: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("昵称不能为空");

  return apiFetch<{ id: string; nickname: string; avatar_url: string | null }>("/api/me", {
    method: "PATCH",
    body: { nickname: trimmed },
  });
}
