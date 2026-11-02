import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  SECONDARY_LOCALES,
  isLandingLocale,
} from "@/lib/locales";
import { landingMetadata } from "@/app/landing/metadata";
import { landingStructuredData } from "@/app/landing/structured-data";
import LandingView from "@/app/landing/landing-view";

/**
 * 非根语言的落地页，例如 `/es`、`/de`、`/ja`。
 *
 * 每种语言一个独立 URL，才能各自有 canonical、hreflang 和一份完整的
 * 本地语言 HTML。只用前端切换语言的话，爬虫只会看到根路径那一种语言。
 *
 * 根路径那一种（海外版是英文，国内版是中文）由 app/page.tsx 负责，
 * 所以这里不生成它，访问 `/{根语言}` 会落到 404。
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return SECONDARY_LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLandingLocale(lang)) return {};
  return landingMetadata(lang);
}

export default async function LocalizedLandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLandingLocale(lang)) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingStructuredData(lang)) }}
      />
      <LandingView locale={lang} />
    </>
  );
}
