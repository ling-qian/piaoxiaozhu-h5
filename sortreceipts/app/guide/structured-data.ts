/**
 * 指南页的结构化数据。
 *
 * 三种类型一起给：Article 说明这是一篇有作者和更新时间的文章，
 * FAQPage 让问答可以单独被抓取，BreadcrumbList 给出页面在站内的位置。
 * 三者都按语言分别生成——英文页面里放中文问答，AI 会当成两份不一致的内容。
 */

import { NEXT_PUBLIC_BASE_URL } from "@/lib/env";
import { HTML_LANG } from "@/lib/locales";

import { DOC_UPDATED, FAQ_ITEMS, GUIDE_SECTIONS, GUIDE_SUMMARY, GUIDE_TITLE } from "./content";
import type { DocLocale } from "./content";
import { topicPath } from "./topics";
import type { DocTopic } from "./topics";

export function docPath(kind: "guide" | "faq", locale: DocLocale): string {
  return locale === "zh" ? `/zh/${kind}` : `/${kind}`;
}

export function guideStructuredData(locale: DocLocale) {
  const base = NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const pageUrl = `${base}${docPath("guide", locale)}`;
  const lang = HTML_LANG[locale];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${pageUrl}#article`,
        headline: GUIDE_TITLE[locale],
        description: GUIDE_SUMMARY[locale],
        inLanguage: lang,
        image: `${base}/og.png`,
        datePublished: DOC_UPDATED,
        dateModified: DOC_UPDATED,
        mainEntityOfPage: pageUrl,
        author: { "@id": `${base}/about#publisher` },
        publisher: { "@id": `${base}/about#publisher` },
        articleSection: GUIDE_SECTIONS[locale].map((s) => s.title),
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        inLanguage: lang,
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.q[locale],
          acceptedAnswer: { "@type": "Answer", text: item.a[locale] },
        })),
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
            name: locale === "zh" ? "指南" : "Guide",
            item: pageUrl,
          },
        ],
      },
    ],
  };
}

export function faqStructuredData(locale: DocLocale) {
  const base = NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const pageUrl = `${base}${docPath("faq", locale)}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        inLanguage: HTML_LANG[locale],
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.q[locale],
          acceptedAnswer: { "@type": "Answer", text: item.a[locale] },
        })),
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
            name: locale === "zh" ? "常见问题" : "FAQ",
            item: pageUrl,
          },
        ],
      },
    ],
  };
}

/**
 * 主题子文的结构化数据。
 *
 * 面包屑多一层（首页 → 指南 → 本篇），这样 AI 读到的层级和页面上的路径一致；
 * 作者继续指向 `/about#publisher`，和主指南同一个主体。
 */
export function topicStructuredData(topic: DocTopic, locale: DocLocale) {
  const base = NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const pageUrl = `${base}${topicPath(topic.slug, locale)}`;
  const guideUrl = `${base}${docPath("guide", locale)}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${pageUrl}#article`,
        headline: topic.title[locale],
        description: topic.summary[locale],
        inLanguage: HTML_LANG[locale],
        image: `${base}/og.png`,
        datePublished: DOC_UPDATED,
        dateModified: DOC_UPDATED,
        mainEntityOfPage: pageUrl,
        isPartOf: { "@id": `${guideUrl}#article` },
        author: { "@id": `${base}/about#publisher` },
        publisher: { "@id": `${base}/about#publisher` },
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        inLanguage: HTML_LANG[locale],
        mainEntity: topic.faq.map((item) => ({
          "@type": "Question",
          name: item.q[locale],
          acceptedAnswer: { "@type": "Answer", text: item.a[locale] },
        })),
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
            name: locale === "zh" ? "指南" : "Guide",
            item: guideUrl,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: topic.title[locale],
            item: pageUrl,
          },
        ],
      },
    ],
  };
}
