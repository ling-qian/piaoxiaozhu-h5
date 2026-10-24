/**
 * 登录态管理（替代原来的 NextAuth）。
 *
 * ## 为什么换掉 NextAuth
 *
 * 原来 H5 用 NextAuth + Prisma 维护**自己一套用户体系**，和小程序（微信 openid）不通用。
 * 现在统一走 Worker 后端的 JWT，两端才是同一批用户。
 *
 * ## 兼容层
 *
 * `auth()` 返回值保持 `{user: {id, email, name}}` 形状，
 * 原有页面的 `session.user.id` 写法不用改；
 * `signIn` / `signOut` 也保持同名，页面 import 不变。
 */

import "server-only";

import { ApiError, apiFetch, clearTokenCookie, getToken, setTokenCookie } from "./api";

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
}

/**
 * 取当前登录态。
 *
 * 未登录返回 null 而不是抛错——服务端组件直接判空即可。
 * token 过期/被吊销同样返回 null（并清掉 cookie）。
 */
export async function auth(): Promise<{ user: SessionUser } | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    const me = await apiFetch<{
      id: string;
      email: string | null;
      nickname: string | null;
    }>("/api/me");
    return {
      user: {
        id: me.id,
        email: me.email,
        name: me.nickname,
      },
    };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      await clearTokenCookie();
    }
    return null;
  }
}

export interface SignInResult {
  ok: boolean;
  error?: string;
}

/** 邮箱密码登录。成功则写 httpOnly cookie。 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    const data = await apiFetch<{
      access_token: string;
      user: { id: string; email: string | null; nickname: string | null };
    }>("/api/auth/email/login", { method: "POST", body: { email, password }, skipAuth: true });
    await setTokenCookie(data.access_token);
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: "登录失败，请稍后重试" };
  }
}

export async function signOut(): Promise<void> {
  await clearTokenCookie();
}

/** 需要登录的页面用：未登录直接跳登录页 */
export async function requireAuth(): Promise<{ user: SessionUser }> {
  const session = await auth();
  if (!session) {
    const { redirect } = await import("next/navigation");
    redirect("/auth/login");
  }
  // redirect() 的类型是 never，但 TS 的收窄在这里不生效，显式断言避免误报
  return session as { user: SessionUser };
}
