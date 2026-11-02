/**
 * 落地页支持的语言一览。
 *
 * 这里只放语言代码和路径规则，不放文案——middleware 和 sitemap 都要用它，
 * 它们不需要那几十段翻译，让它们各自去加载整本字典是浪费。
 */

import { IS_CN_REGION } from "./region";

export const LANDING_LOCALES = ["en", "zh", "es", "pt", "fr", "de", "ja", "ko"] as const;

export type LandingLocale = (typeof LANDING_LOCALES)[number];

/**
 * 根路径 `/` 用哪种语言。
 *
 * 海外部署是英文，国内部署是中文；其余语言一律挂在 `/{code}` 上。
 * 两种部署的 `/` 各自是 x-default，搜索引擎不会把它当成重复页面。
 */
export const ROOT_LOCALE: LandingLocale = IS_CN_REGION ? "zh" : "en";

/** `<html lang>` 的值。中文用 zh-CN，避免和繁体、粤语页面混在一起 */
export const HTML_LANG: Record<LandingLocale, string> = {
  en: "en",
  zh: "zh-CN",
  es: "es",
  pt: "pt-BR",
  fr: "fr",
  de: "de",
  ja: "ja",
  ko: "ko",
};

export function isLandingLocale(value: string): value is LandingLocale {
  return (LANDING_LOCALES as readonly string[]).includes(value);
}

/** 某种语言对应的页面地址，根语言是 `/` */
export function landingPath(locale: LandingLocale): string {
  return locale === ROOT_LOCALE ? "/" : `/${locale}`;
}

/** 需要单独建页面的语言（去掉根路径那一种） */
export const SECONDARY_LOCALES = LANDING_LOCALES.filter((l) => l !== ROOT_LOCALE);

/** 这些路径必须允许未登录访问，否则爬虫会被弹到登录页 */
export const LANDING_PATHS = LANDING_LOCALES.map((l) => `/${l}`);
