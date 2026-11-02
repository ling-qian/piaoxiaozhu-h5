import type { Metadata } from "next";

import { aboutMetadata, aboutStructuredData } from "@/app/about/meta";
import { AboutView } from "@/app/about/view";

export const metadata: Metadata = aboutMetadata("en");

/**
 * 英文关于页。
 *
 * 独立页面的理由不只是「有个地方写公司简介」：结构化数据需要一个稳定的
 * `@id` 作为作者与发布方，指南的 Article 会指回这里。
 */
export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutStructuredData("en")) }}
      />
      <AboutView locale="en" />
    </>
  );
}
