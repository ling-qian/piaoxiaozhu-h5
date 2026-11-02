import { LegalView } from "@/app/legal/view";
import { legalMetadata, legalStructuredData } from "@/app/legal/meta";

/** 服务条款（英文） */
export const metadata = legalMetadata("terms", "en");

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(legalStructuredData("terms", "en")) }}
      />
      <LegalView kind="terms" locale="en" />
    </>
  );
}
