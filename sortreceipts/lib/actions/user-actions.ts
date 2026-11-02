"use server";

/**
 * 用户相关数据操作（已从 Prisma 改为调 Worker 后端）。
 *
 * 函数名与返回形状保持兼容，页面 import 不变。
 * 差异说明：
 *   - 配额从「发票张数」改成「积分」（与小程序同一口径），
 *     所以 checkQuota 的返回含义是「积分余额 vs 套餐额度」，不是张数。
 */

import { cookies } from "next/headers";

import { apiFetch, setTokenCookie } from "@/lib/api";
import { auth } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 与 middleware 的 REF_COOKIE 保持一致 */
const REF_COOKIE = "px_ref";
/** 推广渠道 cookie，内容是 `source|medium|campaign` */
const SRC_COOKIE = "px_src";

/**
 * 服务端动作的结果。
 *
 * 为什么不直接抛错：生产环境下 Next 会把 server action 抛出的错误
 * 统一换成一句泛化提示（只留 digest），用户看不到「这个邮箱已经注册过」
 * 这类真正有用的原因，浏览器控制台里也只剩一个 500。
 * 所以把失败原因当作普通返回值传回页面。
 */
export type ActionOutcome = { ok: true } | { ok: false; error: string };

function failure(e: unknown, fallback: string): ActionOutcome {
  const message = e instanceof Error && e.message ? e.message : fallback;
  return { ok: false, error: message };
}

/**
 * 注册第一步：让后端把六位验证码发到邮箱。
 *
 * 带上人机验证的 token。服务端会把它转给 Cloudflare 校验，
 * 没通过就不发信——否则这个接口就是一个免费的邮件轰炸机。
 */
export async function sendRegisterCode(email: string, turnstileToken: string): Promise<ActionOutcome> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmedEmail)) return { ok: false, error: "邮箱格式不正确" };

  try {
    await apiFetch<{ ok: boolean; expires_in: number }>("/api/auth/email/code", {
      method: "POST",
      body: { email: trimmedEmail, turnstileToken },
      skipAuth: true,
    });
    return { ok: true };
  } catch (e) {
    return failure(e, "验证码发送失败，请稍后重试");
  }
}

/**
 * 注册第二步：凭验证码建账号。
 *
 * 验证码由用户从邮箱里读出来填回来，服务端核对通过才建账号。
 * 光有邮箱地址不算数——这一步证明的是「这个地址真的能收信」。
 */
export async function registerUser(
  email: string,
  password: string,
  name: string,
  code: string,
): Promise<ActionOutcome> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmedEmail)) return { ok: false, error: "邮箱格式不正确" };
  if (password.length < 8) return { ok: false, error: "密码至少8位" };
  if (!name.trim()) return { ok: false, error: "昵称不能为空" };
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "请输入邮件里的 6 位验证码" };

  try {
    // 会计推荐码由 middleware 写在 cookie 里；注册是这个码唯一的使用时机。
    // 注册成功后清掉，同一浏览器换账号注册时不会把上一个人的来源带过去。
    const store = await cookies();
    const ref = store.get(REF_COOKIE)?.value;

    let src: { source: string; medium?: string; campaign?: string } | undefined;
    const rawSrc = store.get(SRC_COOKIE)?.value;
    if (rawSrc) {
      // ResponseCookies 写入时会把 `|` 编码成 %7C，读回来要先解码一次
      let decoded = rawSrc;
      try {
        decoded = decodeURIComponent(rawSrc);
      } catch {
        // 极少数被改坏的 cookie 就按原值处理，反正 normalize 会兜底
      }
      const [source, medium, campaign] = decoded.split("|");
      if (source) {
        src = {
          source,
          medium: medium || undefined,
          campaign: campaign || undefined,
        };
      }
    }

    const data = await apiFetch<{ access_token: string; user: { id: string; email: string | null; nickname: string | null } }>(
      "/api/auth/email/register",
      {
        method: "POST",
        body: { email: trimmedEmail, password, nickname: name.trim(), code, ref, src },
        skipAuth: true,
      },
    );
    // 注册后直接登录，不用用户再输一次密码
    await setTokenCookie(data.access_token);
    store.delete(REF_COOKIE);
    store.delete(SRC_COOKIE);
    return { ok: true };
  } catch (e) {
    return failure(e, "注册失败，请稍后重试");
  }
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
