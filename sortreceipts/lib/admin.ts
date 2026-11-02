/**
 * 后台管理的令牌存取。
 *
 * 令牌放在独立的 httpOnly cookie 里，和用户登录态分开：
 * 管理员可能同时以普通用户身份浏览，混用一个 cookie 会互相踢掉。
 *
 * 为什么不用 localStorage：那是浏览器 JS 可读的，一次 XSS 就泄露。
 * httpOnly cookie 前端 JS 拿不到，只能由服务端转发给 Worker。
 */

import { cookies } from "next/headers";

export const ADMIN_COOKIE = "px_admin";

/** 后台会话有效期。比用户登录短得多：管理令牌权限太大，不该长期留在浏览器 */
const ADMIN_MAX_AGE = 60 * 60 * 8;

export async function setAdminCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_MAX_AGE,
    path: "/",
  });
}

export async function clearAdminCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export async function getAdminToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value;
}

/** Worker 地址。和用户端接口共用同一个配置项 */
export function workerBaseUrl(): string {
  const url = process.env.WORKER_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error("未配置 WORKER_API_URL（后端地址）");
  return url.replace(/\/+$/, "");
}

/**
 * 带管理令牌调 Worker。
 *
 * 单独写一个而不是复用 `apiFetch`：那个函数会注入用户 JWT 并在 401 时清登录态，
 * 后台接口用的是 `X-Admin-Token`，两者语义不同，混用会把管理员踢下线。
 */
export async function adminFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${workerBaseUrl()}${path}`, {
    ...init,
    headers: { "X-Admin-Token": token, ...(init?.headers as Record<string, string> | undefined) },
    cache: "no-store",
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Worker 返回了非 JSON（极少见），下面按状态码处理
  }

  if (!res.ok) {
    const detail =
      (body as { detail?: string; error?: string } | null)?.detail ??
      (body as { error?: string } | null)?.error ??
      `请求失败（${res.status}）`;
    throw new Error(detail);
  }
  return body as T;
}
