import { LegalView } from "@/app/legal/view";
import { legalMetadata, legalStructuredData } from "@/app/legal/meta";

/** 退款政策（英文） */
export const metadata = legalMetadata("refund", "en");

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(legalStructuredData("refund", "en")) }}
      />
      <LegalView kind="refund" locale="en" />
    </>
  );
}
