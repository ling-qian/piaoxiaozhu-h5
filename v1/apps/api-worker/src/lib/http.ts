/**
 * 统一错误与响应。
 *
 * 错误体必须是 `{"detail": "..."}` —— 前端 api.ts 读的就是 `res.data.detail`，
 * 换成别的字段名，所有错误提示会退化成「请求失败」四个字。
 */
import type { Context } from "hono";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new ApiError(400, msg);
export const unauthorized = (msg = "Not authenticated") => new ApiError(401, msg);
export const forbidden = (msg: string) => new ApiError(403, msg);
export const notFound = (msg = "Not found") => new ApiError(404, msg);
export const paymentRequired = (msg: string) => new ApiError(402, msg);
export const serverError = (msg: string) => new ApiError(500, msg);

/** 全局错误处理：把 ApiError 转成 FastAPI 风格的响应体 */
export function errorHandler(err: Error, c: Context) {
  if (err instanceof ApiError) {
    return c.json({ detail: err.message }, err.status as any);
  }
  console.error("[unhandled]", err);
  return c.json({ detail: "服务内部错误" }, 500);
}

/** 校验 UUID 形状。非法 id 直接 404，避免把脏值塞进 SQL。 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: string | undefined | null): boolean {
  return !!v && UUID_RE.test(v);
}

/** 缺字段/超范围的通用校验 */
export function requireString(v: unknown, field: string, max = 200): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw badRequest(`${field}不能为空`);
  if (s.length > max) throw badRequest(`${field}过长（最多 ${max} 字）`);
  return s;
}

export function optionalString(v: unknown, max = 200): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}
