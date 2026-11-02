import type { Metadata } from "next";

import { guideMetadata } from "@/app/guide/metadata";
import { guideStructuredData } from "@/app/guide/structured-data";
import { GuideView } from "@/app/guide/view";

export const metadata: Metadata = guideMetadata("en");

/**
 * 英文指南页。
 *
 * 长文放在独立 URL 而不是落地页的一段折叠里：AI 引用时需要能定位到
 * 一篇有标题、有更新时间、有作者的完整文章，落地页的短段落做不到。
 */
export default function GuidePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(guideStructuredData("en")) }}
      />
      <GuideView locale="en" />
    </>
  );
}
