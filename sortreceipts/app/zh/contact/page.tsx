import { LegalView } from "@/app/legal/view";
import { legalMetadata, legalStructuredData } from "@/app/legal/meta";

/** 联系页（中文） */
export const metadata = legalMetadata("contact", "zh");

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(legalStructuredData("contact", "zh")) }}
      />
      <LegalView kind="contact" locale="zh" />
    </>
  );
}
