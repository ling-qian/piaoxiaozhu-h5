/**
 * 落地页的结构化数据（JSON-LD）。
 *
 * 页面文字按语言分别生成，结构化数据也必须跟着换语言：搜索引擎把
 * FAQPage 的内容当作文本读，英文页面配中文问答会被当成不一致。
 */

import { NEXT_PUBLIC_BASE_URL } from "@/lib/env";
import { HTML_LANG, landingPath } from "@/lib/locales";
import type { LandingLocale } from "@/lib/locales";
import { FAQ_LIST, HOW_STEPS } from "./content";
import { LANDING_STRINGS, LOCALE_META } from "./i18n";

export function landingStructuredData(locale: LandingLocale) {
  const base = NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const path = landingPath(locale);
  const pageUrl = `${base}${path}`;
  const meta = LOCALE_META[locale];
  const s = LANDING_STRINGS[locale];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: "SortReceipts",
        url: base,
        logo: `${base}/icon-512.png`,
        description:
          "A browser-based receipt scanner and cost tracker for small restaurants, cafés and food trucks. Supplier invoices become categorized cost records, monthly revenue and gross margin.",
        availableLanguage: ["en", "zh"],
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        url: base,
        name: "SortReceipts",
        publisher: { "@id": `${base}/#organization` },
        inLanguage: HTML_LANG[locale],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${pageUrl}#app`,
        name: "SortReceipts",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Expense tracking",
        operatingSystem: "Web",
        url: pageUrl,
        image: `${base}/og.png`,
        description: meta.description,
        offers: [
          { "@type": "Offer", name: s.planFree, price: "0", priceCurrency: "USD" },
          { "@type": "Offer", name: s.planPro, price: "3.99", priceCurrency: "USD" },
          { "@type": "Offer", name: s.planBiz, price: "13.99", priceCurrency: "USD" },
        ],
        isAccessibleForFree: true,
        audience: {
          "@type": "BusinessAudience",
          audienceType: s.valueFit,
        },
        inLanguage: HTML_LANG[locale],
        publisher: { "@id": `${base}/#organization` },
      },
      {
        "@type": "HowTo",
        "@id": `${pageUrl}#howto`,
        name: s.howTitle,
        description: s.howSub,
        inLanguage: HTML_LANG[locale],
        estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
        step: HOW_STEPS.map((step, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: step.title[locale],
          text: step.text[locale],
        })),
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        inLanguage: HTML_LANG[locale],
        mainEntity: FAQ_LIST.map((item) => ({
          "@type": "Question",
          name: item.q[locale],
          acceptedAnswer: { "@type": "Answer", text: item.a[locale] },
        })),
      },
    ],
  };
}
