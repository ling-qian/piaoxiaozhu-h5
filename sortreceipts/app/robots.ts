import type { MetadataRoute } from "next";

import { NEXT_PUBLIC_BASE_URL } from "@/lib/env";

/**
 * 只放营销页。登录、注册、后台和工作台不需要被索引：
 * 它们要么要求登录，要么只是工具界面，索引进去只会稀释站点主题。
 *
 * AI 爬虫单独列一组，而不是只靠 `*`：GEO 的做法是把放行写成明示条款，
 * 让对方知道这不是「没拦住」，而是「允许」。每条规则都带上同样的
 * disallow——只写 `Allow: /` 的组没有排除项，会把 `/api/` 一起放进来。
 */
const DISALLOW = ["/api/", "/admin", "/auth/login", "/auth/register"];

/** 主流生成式引擎的抓取与索引爬虫 */
const AI_BOTS = [
  "GPTBot", // OpenAI 训练与检索
  "OAI-SearchBot", // ChatGPT 搜索
  "ChatGPT-User", // ChatGPT 实时浏览
  "PerplexityBot", // Perplexity
  "ClaudeBot", // Anthropic
  "Google-Extended", // Gemini 训练
  "Googlebot", // Google AI Overviews
  "Bingbot", // Copilot
  "Applebot-Extended", // Apple 智能
  "CCBot", // Common Crawl，多数模型的语料来源
  "Amazonbot", // Amazon 智能助手
  "Bytespider", // 字节跳动
];

export default function robots(): MetadataRoute.Robots {
  const base = NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
