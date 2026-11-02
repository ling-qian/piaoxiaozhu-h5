/**
 * 后端语言（locale）。
 *
 * 为什么用 `Accept-Language` 而不用业务参数：
 * 它是标准 HTTP 头，前端 `apiFetch` 只需覆盖一次，所有接口自动继承；
 * 不必在每个请求体里多塞一个 `locale` 字段，也不会漏传。
 *
 * 判定顺序：
 * 1. 请求头第一段语言（浏览器的真实偏好，用户在前端切语言后会覆盖）
 * 2. 部署区域 `REGION`（海外 intl 默认英文，国内 cn 默认中文）
 * 3. 英文
 *
 * 注意：Worker 是并发多租户的，**不能**把语言存成模块级可变变量，
 * 否则并发请求会串语言。每次调用都从 `c` 现算。
 */
import type { Context } from "hono";

export type Locale = "zh" | "en";

export function getLocale(c: Context): Locale {
  const accept = (c.req.header("accept-language") ?? "").toLowerCase();
  // "zh-CN,zh;q=0.9,en;q=0.8" —— 只看第一段，它代表最高优先级
  const first = accept.split(",")[0]?.trim() ?? "";
  if (first.startsWith("zh")) return "zh";
  if (first.startsWith("en")) return "en";

  const region = (c.env as { REGION?: string } | undefined)?.REGION;
  return region === "cn" ? "zh" : "en";
}

/** 按当前请求语言二选一。英文优先兜住海外用户，避免漏翻时看到中文。 */
export function pick(c: Context, zh: string, en: string): string {
  return getLocale(c) === "en" ? en : zh;
}
