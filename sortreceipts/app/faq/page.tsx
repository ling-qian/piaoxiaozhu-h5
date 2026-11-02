import type { Metadata } from "next";

import { faqMetadata } from "@/app/guide/metadata";
import { faqStructuredData } from "@/app/guide/structured-data";
import { FaqView } from "@/app/guide/view";

export const metadata: Metadata = faqMetadata("en");

/**
 * 独立问答页。
 *
 * 落地页里那段 FAQ 只覆盖购买前的疑问；这一页覆盖使用中的长尾问题，
 * 每条答案都能指向产品里真实存在的行为。
 */
export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData("en")) }}
      />
      <FaqView locale="en" />
    </>
  );
}
