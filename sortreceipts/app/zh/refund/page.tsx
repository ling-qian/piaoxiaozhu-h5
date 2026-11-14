import { LegalView } from "@/app/legal/view";
import { legalMetadata, legalStructuredData } from "@/app/legal/meta";

/** 退款政策（中文） */
export const metadata = legalMetadata("refund", "zh");

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(legalStructuredData("refund", "zh")) }}
      />
      <LegalView kind="refund" locale="zh" />
    </>
  );
}
