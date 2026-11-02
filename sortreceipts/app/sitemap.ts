import type { MetadataRoute } from "next";

import { NEXT_PUBLIC_BASE_URL } from "@/lib/env";
import { LANDING_LOCALES, ROOT_LOCALE, landingPath } from "@/lib/locales";
import { DOC_UPDATED } from "@/app/guide/content";
import { TOPICS } from "@/app/guide/topics";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const lastModified = new Date(DOC_UPDATED);

  // 每种语言各自一条，方便各地区的搜索引擎分别收录
  const landing: MetadataRoute.Sitemap = LANDING_LOCALES.map((locale) => ({
    url: `${base}${landingPath(locale)}`,
    lastModified,
    changeFrequency: "weekly",
    priority: locale === ROOT_LOCALE ? 1 : 0.8,
  }));

  // 内容页只有英文和中文：其余语言的市场靠营销页覆盖，长文翻译的维护成本
  // 会把「更新一次就要改七份」变成常态，最后没人改
  const docs: MetadataRoute.Sitemap = [
    { url: `${base}/guide`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/zh/guide`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/faq`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/zh/faq`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/about`, lastModified, changeFrequency: "yearly", priority: 0.7 },
    { url: `${base}/zh/about`, lastModified, changeFrequency: "yearly", priority: 0.5 },
    // 法务与联系页：搜索引擎不靠它们带来流量，但缺了它们，推广平台会先扣分
    { url: `${base}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/terms`, lastModified, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/contact`, lastModified, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/zh/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/zh/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/zh/contact`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    ...TOPICS.flatMap((topic) => [
      {
        url: `${base}/guide/${topic.slug}`,
        lastModified,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      },
      {
        url: `${base}/zh/guide/${topic.slug}`,
        lastModified,
        changeFrequency: "monthly" as const,
        priority: 0.5,
      },
    ]),
  ];

  return [
    ...landing,
    ...docs,
    { url: `${base}/promo`, lastModified, changeFrequency: "monthly", priority: 0.6 },
  ];
}
