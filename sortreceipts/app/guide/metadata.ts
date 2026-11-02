/**
 * 指南与问答页的 metadata。
 *
 * canonical 与 hreflang 在这里统一生成：两个物理页面（英文、中文）
 * 各写一遍，迟早会有一边忘了改。
 */

import type { Metadata } from "next";

import { NEXT_PUBLIC_BASE_URL } from "@/lib/env";

import { docPath } from "./structured-data";
import { FAQ_ITEMS, GUIDE_SUMMARY, GUIDE_TITLE } from "./content";
import type { DocLocale } from "./content";
import { topicPath } from "./topics";
import type { DocTopic } from "./topics";

function alternates(kind: "guide" | "faq") {
  return {
    canonical: docPath(kind, "en"),
    languages: {
      en: docPath(kind, "en"),
      "zh-CN": docPath(kind, "zh"),
      "x-default": docPath(kind, "en"),
    },
  };
}

export function guideMetadata(locale: DocLocale): Metadata {
  const path = docPath("guide", locale);
  return {
    title: `${GUIDE_TITLE[locale]} | SortReceipts`,
    description: GUIDE_SUMMARY[locale],
    alternates: { ...alternates("guide"), canonical: path },
    openGraph: {
      title: GUIDE_TITLE[locale],
      description: GUIDE_SUMMARY[locale],
      url: `${NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")}${path}`,
      siteName: "SortReceipts",
      type: "article",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: GUIDE_TITLE[locale] }],
    },
    robots: { index: true, follow: true },
  };
}

export function faqMetadata(locale: DocLocale): Metadata {
  const path = docPath("faq", locale);
  const title =
    locale === "zh" ? "常见问题：票据识别与记账" : "Frequently asked questions about receipt scanning";
  const description =
    locale === "zh"
      ? `关于识别准确度、文件大小、餐饮分类、导出与数据删除的 ${FAQ_ITEMS.length} 个常见问题。`
      : `Short, direct answers to ${FAQ_ITEMS.length} common questions about receipt scanning, restaurant categories, pricing and data handling.`;

  return {
    title: `${title} | SortReceipts`,
    description,
    alternates: { ...alternates("faq"), canonical: path },
    openGraph: {
      title,
      description,
      url: `${NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")}${path}`,
      siteName: "SortReceipts",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: title }],
    },
    robots: { index: true, follow: true },
  };
}

export function topicMetadata(topic: DocTopic, locale: DocLocale): Metadata {
  const path = topicPath(topic.slug, locale);
  const base = NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");

  return {
    title: `${topic.title[locale]} | SortReceipts`,
    description: topic.summary[locale],
    alternates: {
      canonical: path,
      languages: {
        en: topicPath(topic.slug, "en"),
        "zh-CN": topicPath(topic.slug, "zh"),
        "x-default": topicPath(topic.slug, "en"),
      },
    },
    openGraph: {
      title: topic.title[locale],
      description: topic.summary[locale],
      url: `${base}${path}`,
      siteName: "SortReceipts",
      type: "article",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: topic.title[locale] }],
    },
    robots: { index: true, follow: true },
  };
}
