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
/**
 * 语言 cookie。由 `lib/i18n.tsx` 的 `setLocale` 写入。
 *
 * 为什么要走 cookie 而不是 localStorage：`apiFetch` 运行在服务端（server action），
 * 读不到 localStorage，只能读 cookie。语言要跟着用户走，才能让后端的
 * 错误信息与 AI 分析输出与他看到的界面语言一致。
 */
export const LOCALE_COOKIE = "px_locale";
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
  /**
   * 响应按什么解析。
   *
   * 交付包的 CSV 是纯文本，再走 JSON.parse 会直接抛错；错误体仍然按 JSON 解析，
   * 这样后端的 `detail` 还能带到界面上。
   */
  expect?: "json" | "text";
}

/** 统一的请求出口：自动带 JWT、自动解析 JSON、非 2xx 抛 ApiError */
export async function apiFetch<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": opts.contentType ?? "application/json",
  };

  // 一次拿到 cookie store：token 与语言都从这里读，避免重复调用 cookies()
  const store = await cookies();

  // 让后端知道该用哪种语言：错误信息、AI 分析结果都按这个返回。
  // 用户没手动切过语言时不写这个 cookie，后端按部署区域 REGION 兜底。
  const locale = store.get(LOCALE_COOKIE)?.value;
  if (locale === "zh" || locale === "en") {
    headers["Accept-Language"] = locale;
  }
  const isZh = locale === "zh" || (locale === undefined && process.env.NEXT_PUBLIC_REGION === "cn");

  let token: string | undefined;
  if (!opts.skipAuth) {
    token = store.get(TOKEN_COOKIE)?.value;
    if (!token) throw new ApiError(401, isZh ? "未登录" : "Not signed in");
    headers["Authorization"] = `Bearer ${token}`;
  }

  const resp = await fetch(`${baseUrl()}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.raw !== undefined ? opts.raw : opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });

  const text = await resp.text();

  if (!resp.ok) {
    // 错误体统一按 JSON 读 detail；读不出来（比如网关的 HTML 错误页）
    // 就退回状态码，不把一段 HTML 塞进用户的提示框
    let detail: string | undefined;
    try {
      detail = JSON.parse(text)?.detail;
    } catch {
      detail = undefined;
    }
    throw new ApiError(resp.status, detail || `请求失败(${resp.status})`);
  }

  if (opts.expect === "text") return text as T;

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(resp.status, `后端返回了非 JSON 内容: ${text.slice(0, 120)}`);
  }

  return data as T;
}

/** 取纯文本响应（月度交付包的 CSV） */
export async function apiFetchText(path: string, opts: RequestOptions = {}): Promise<string> {
  return apiFetch<string>(path, { ...opts, expect: "text" });
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
