/**
 * 集中管理所有环境变量默认值。
 * 所有服务端模块从此文件读取，避免散落的 process.env 调用。
 *
 * 识别与 AI 分析已经全部搬到 Worker 后端，前端不再持有 LLM 的地址与密钥，
 * 因此这里没有 LLM 相关配置。限额与配额也由后端扣，前端不再自己算。
 */

// ─── 收款码（国内形态的人工审核支付）────────────────────────────
export const WECHAT_PAY_QR_URL = process.env.WECHAT_PAY_QR_URL || "";
export const ALIPAY_QR_URL = process.env.ALIPAY_QR_URL || "";

/**
 * 只用于判断国内形态下要不要显示 Stripe 入口。
 *
 * 境外支付走 Worker 的 `/api/payments/intl/*`，那里有独立的密钥与开关；
 * 这个值不参与任何下单逻辑，也不发给浏览器。
 */
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

// ─── App ──────────────────────────────────────────────────────
export const NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://sortreceipts.qianling-tech.top";

// Cloudflare Web Analytics 的站点令牌。留空时页面不加载统计脚本，
// 开发环境和没开统计的环境都不会去请求一个不存在的 beacon。
export const NEXT_PUBLIC_CF_ANALYTICS_TOKEN = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN || "";
