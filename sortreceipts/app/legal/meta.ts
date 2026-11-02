/**
 * 法务页与联系页的 metadata 和结构化数据。
 *
 * 三页共用一套路径规则，避免英文中文各写一遍 canonical 之后漏改一边。
 * 结构化数据里 publisher 指向 `/about#publisher`：站点主体只有一个，
 * 法务页不应该另起一个组织节点。
 */

import type { Metadata } from "next";

import type { DocLocale } from "@/app/guide/content";
import { NEXT_PUBLIC_BASE_URL } from "@/lib/env";
import { HTML_LANG } from "@/lib/locales";

import { CONTACT_EMAIL, LEGAL_SUMMARY, LEGAL_TITLE, LEGAL_UPDATED } from "./content";
import type { LegalKind } from "./content";

export function legalPath(kind: LegalKind, locale: DocLocale): string {
  return locale === "zh" ? `/zh/${kind}` : `/${kind}`;
}

export function legalMetadata(kind: LegalKind, locale: DocLocale): Metadata {
  const path = legalPath(kind, locale);
  const base = NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const title = LEGAL_TITLE[kind][locale];
  const description = LEGAL_SUMMARY[kind][locale];

  return {
    title: `${title} | SortReceipts`,
    description,
    alternates: {
      canonical: path,
      languages: {
        en: legalPath(kind, "en"),
        "zh-CN": legalPath(kind, "zh"),
        "x-default": legalPath(kind, "en"),
      },
    },
    openGraph: {
      title,
      description,
      url: `${base}${path}`,
      siteName: "SortReceipts",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: title }],
    },
    robots: { index: true, follow: true },
  };
}

export function legalStructuredData(kind: LegalKind, locale: DocLocale) {
  const base = NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const pageUrl = `${base}${legalPath(kind, locale)}`;
  const lang = HTML_LANG[locale];
  const pageType = kind === "contact" ? "ContactPage" : "WebPage";

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": pageType,
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: LEGAL_TITLE[kind][locale],
        description: LEGAL_SUMMARY[kind][locale],
        inLanguage: lang,
        dateModified: LEGAL_UPDATED,
        isPartOf: { "@id": `${base}/#website` },
        publisher: { "@id": `${base}/about#publisher` },
        ...(kind === "contact" ? { about: { "@id": `${base}/about#publisher` }, mainEntity: {
          "@type": "Organization",
          "@id": `${base}/about#publisher`,
          name: "Qianling Tech",
          email: CONTACT_EMAIL,
        } } : {}),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: locale === "zh" ? "首页" : "Home",
            item: `${base}${locale === "zh" ? "/zh" : "/"}`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: LEGAL_TITLE[kind][locale],
            item: pageUrl,
          },
        ],
      },
    ],
  };
}
