import { LegalView } from "@/app/legal/view";
import { legalMetadata, legalStructuredData } from "@/app/legal/meta";

/** 联系页（英文） */
export const metadata = legalMetadata("contact", "en");

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(legalStructuredData("contact", "en")) }}
      />
      <LegalView kind="contact" locale="en" />
    </>
  );
}
