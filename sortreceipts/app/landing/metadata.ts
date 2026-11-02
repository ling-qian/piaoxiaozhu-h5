/**
 * 落地页的 metadata。
 *
 * `/` 和 `/{lang}` 两个路由共用这一份，标题、描述、canonical 和 hreflang
 * 才不会各写一遍然后慢慢对不上。
 */

import type { Metadata } from "next";

import { HTML_LANG, LANDING_LOCALES, ROOT_LOCALE, landingPath } from "@/lib/locales";
import type { LandingLocale } from "@/lib/locales";
import { LOCALE_META } from "./i18n";

export function landingMetadata(locale: LandingLocale): Metadata {
  const meta = LOCALE_META[locale];
  const canonical = landingPath(locale);

  // 每种语言一个 hreflang，外加 x-default 指向根路径。
  // 同一份语言列表在两家路由上生成，指向完全相同的地址集合。
  const languages: Record<string, string> = {};
  for (const l of LANDING_LOCALES) languages[HTML_LANG[l]] = landingPath(l);
  languages["x-default"] = landingPath(ROOT_LOCALE);

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical, languages },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: canonical,
      siteName: "SortReceipts",
      type: "website",
      locale: meta.ogLocale,
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: meta.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: ["/og.png"],
    },
    robots: { index: true, follow: true },
  };
}
