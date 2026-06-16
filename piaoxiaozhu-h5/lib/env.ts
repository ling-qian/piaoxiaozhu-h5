/**
 * 集中管理所有环境变量默认值。
 * 所有服务端模块从此文件读取，避免散落的 process.env 调用。
 */

// ─── LLM / OCR ────────────────────────────────────────────────
export const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://apihub.agnes-ai.com/v1";
export const LLM_API_KEY = process.env.LLM_API_KEY || "";
export const LLM_MODEL = process.env.LLM_MODEL_NAME || "agnes-2.0-flash";

// ─── Stripe ───────────────────────────────────────────────────
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
export const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || "";
export const STRIPE_ENTERPRISE_PRICE_ID = process.env.STRIPE_ENTERPRISE_PRICE_ID || "";

// ─── 收款码 ──────────────────────────────────────────────────
export const WECHAT_PAY_QR_URL = process.env.WECHAT_PAY_QR_URL || "";
export const ALIPAY_QR_URL = process.env.ALIPAY_QR_URL || "";

// ─── App ──────────────────────────────────────────────────────
export const NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://piaoxiaozhu-h5.vercel.app";
export const NEXT_PUBLIC_SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || "";

// ─── Quota / Rate Limit ───────────────────────────────────────
export const OCR_MAX_PER_DAY = parseInt(process.env.OCR_MAX_PER_DAY || "50", 10);
export const OCR_RATE_LIMIT_WINDOW_MS = parseInt(process.env.OCR_RATE_LIMIT_WINDOW_MS || "60000", 10);
export const OCR_RATE_LIMIT_MAX = parseInt(process.env.OCR_RATE_LIMIT_MAX || "10", 10);
