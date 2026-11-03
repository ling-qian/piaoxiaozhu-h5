import type { Metadata } from "next";

import { auth } from "@/lib/auth";
import PromoClient from "./promo-client";

/**
 * 推广页的 metadata。
 *
 * 它和首页内容不完全相同（多了对比表和适用门店），但之前没写 metadata，
 * 整页只继承根布局的标题，canonical 也没有。它又进了 sitemap，
 * 搜索引擎会把它当成一份没有自我声明的重复页。这里补上独立声明。
 */
export const metadata: Metadata = {
  title: "SortReceipts for restaurants, cafés and food trucks",
  description:
    "How a photo of a supplier invoice becomes a categorized cost record and a month-end report. See the workflow, pricing and which restaurants it fits.",
  alternates: { canonical: "/promo" },
  openGraph: {
    title: "SortReceipts for restaurants, cafés and food trucks",
    description:
      "How a photo of a supplier invoice becomes a categorized cost record and a month-end report.",
    url: "/promo",
    siteName: "SortReceipts",
    type: "website",
    locale: "en_US",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SortReceipts" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SortReceipts for restaurants, cafés and food trucks",
    description:
      "How a photo of a supplier invoice becomes a categorized cost record and a month-end report.",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export default async function PromoPage() {
  const session = await auth();
  const userId = session?.user?.id || null;

  return <PromoClient userId={userId} />;
}
