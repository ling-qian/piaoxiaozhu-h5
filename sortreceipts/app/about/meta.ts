/**
 * 关于页的 metadata 与结构化数据。
 *
 * Organization 用独立 `@id`（`/about#publisher`），和落地页那份品牌实体分开：
 * 落地页的 Organization 代表产品品牌，这一份代表运营方。两者合并成一个节点
 * 会出现「同一个 id 两个名字」的冲突，AI 干脆都不认。
 */

import type { Metadata } from "next";

import { NEXT_PUBLIC_BASE_URL } from "@/lib/env";
import { HTML_LANG } from "@/lib/locales";

import { ABOUT_SUMMARY, ABOUT_TITLE } from "./content";
import { CONTACT_EMAIL } from "../legal/content";
import type { DocLocale } from "../guide/content";

export function aboutPath(locale: DocLocale): string {
  return locale === "zh" ? "/zh/about" : "/about";
}

export function aboutMetadata(locale: DocLocale): Metadata {
  const path = aboutPath(locale);
  const base = NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");

  return {
    title: `${ABOUT_TITLE[locale]} | Qianling Tech`,
    description: ABOUT_SUMMARY[locale],
    alternates: {
      canonical: path,
      languages: { en: "/about", "zh-CN": "/zh/about", "x-default": "/about" },
    },
    openGraph: {
      title: ABOUT_TITLE[locale],
      description: ABOUT_SUMMARY[locale],
      url: `${base}${path}`,
      siteName: "SortReceipts",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: ABOUT_TITLE[locale] }],
    },
    robots: { index: true, follow: true },
  };
}

export function aboutStructuredData(locale: DocLocale) {
  const base = NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const pageUrl = `${base}${aboutPath(locale)}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/about#publisher`,
        name: "Qianling Tech",
        url: pageUrl,
        logo: `${base}/icon-512.png`,
        email: CONTACT_EMAIL,
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: CONTACT_EMAIL,
          availableLanguage: ["en", "zh"],
        },
        description: ABOUT_SUMMARY[locale],
        brand: { "@type": "Brand", name: "SortReceipts" },
        availableLanguage: ["en", "zh"],
        makesOffer: {
          "@type": "Offer",
          itemOffered: {
            "@type": "SoftwareApplication",
            name: "SortReceipts",
            sameAs: ["https://www.producthunt.com/products/sortreceipts/sortreceipts"],
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
          },
        },
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
            name: ABOUT_TITLE[locale],
            item: pageUrl,
          },
        ],
      },
    ],
    inLanguage: HTML_LANG[locale],
  };
}
