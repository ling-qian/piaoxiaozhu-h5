/**
 * Cloudflare Worker 后端客户端。
 *
 * ## 为什么在服务端调，而不是浏览器直连
 *
 * 1. **JWT 放在 httpOnly cookie 里**，前端 JS 拿不到 —— XSS 偷不走登录态
 * 2. 没有跨域问题（服务端到服务端）
 * 3. 后端地址不暴露给浏览器
 *
 * ## 错误处理
 *
 * Worker 的错误体是 `{"detail": "..."}`（对齐旧 FastAPI 实现）。
 * 401 一律上抛 `ApiError("未登录")`，由 server action 转成业务错误。
 */

import { cookies } from "next/headers";

export const TOKEN_COOKIE = "px_token";
/** 与 Worker 侧 JWT 有效期一致（7 天） */
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7;

function baseUrl(): string {
  const url = process.env.WORKER_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error("未配置 WORKER_API_URL（后端地址）");
  return url.replace(/\/+$/, "");
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** 原始字节体（上传图片给 OCR 用），传了就不再 JSON 序列化 body */
  raw?: ArrayBuffer;
  /** 覆盖 Content-Type，默认 application/json */
  contentType?: string;
  /** 不带登录态（登录/注册本身） */
  skipAuth?: boolean;
}

/** 统一的请求出口：自动带 JWT、自动解析 JSON、非 2xx 抛 ApiError */
export async function apiFetch<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": opts.contentType ?? "application/json",
  };

  let token: string | undefined;
  if (!opts.skipAuth) {
    const store = await cookies();
    token = store.get(TOKEN_COOKIE)?.value;
    if (!token) throw new ApiError(401, "未登录");
    headers["Authorization"] = `Bearer ${token}`;
  }

  const resp = await fetch(`${baseUrl()}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.raw !== undefined ? opts.raw : opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });

  const text = await resp.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(resp.status, `后端返回了非 JSON 内容: ${text.slice(0, 120)}`);
  }

  if (!resp.ok) {
    throw new ApiError(resp.status, data?.detail || `请求失败(${resp.status})`);
  }
  return data as T;
}

/** 写入登录态（httpOnly，浏览器 JS 读不到） */
export async function setTokenCookie(token: string) {
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TOKEN_MAX_AGE,
    path: "/",
  });
}

export async function clearTokenCookie() {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
}

export async function getToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value;
}
