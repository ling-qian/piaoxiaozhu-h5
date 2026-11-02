import type { Metadata } from "next";

import { guideMetadata } from "@/app/guide/metadata";
import { guideStructuredData } from "@/app/guide/structured-data";
import { GuideView } from "@/app/guide/view";

export const metadata: Metadata = guideMetadata("zh");

/** 中文指南页。产品界面支持中文，这份内容按同一份事实写成中文，不是机器翻译 */
export default function ZhGuidePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(guideStructuredData("zh")) }}
      />
      <GuideView locale="zh" />
    </>
  );
}
