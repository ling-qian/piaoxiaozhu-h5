import type { Metadata } from "next";

import { faqMetadata } from "@/app/guide/metadata";
import { faqStructuredData } from "@/app/guide/structured-data";
import { FaqView } from "@/app/guide/view";

export const metadata: Metadata = faqMetadata("zh");

/** 中文问答页 */
export default function ZhFaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData("zh")) }}
      />
      <FaqView locale="zh" />
    </>
  );
}
