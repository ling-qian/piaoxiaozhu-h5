import type { Metadata } from "next";

import { aboutMetadata, aboutStructuredData } from "@/app/about/meta";
import { AboutView } from "@/app/about/view";

export const metadata: Metadata = aboutMetadata("zh");

/** 中文关于页 */
export default function ZhAboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutStructuredData("zh")) }}
      />
      <AboutView locale="zh" />
    </>
  );
}
