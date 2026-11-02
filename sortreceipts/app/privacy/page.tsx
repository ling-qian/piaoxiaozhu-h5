import { LegalView } from "@/app/legal/view";
import { legalMetadata, legalStructuredData } from "@/app/legal/meta";

/** 隐私政策（英文）。公开发布，未登录也能读 */
export const metadata = legalMetadata("privacy", "en");

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(legalStructuredData("privacy", "en")) }}
      />
      <LegalView kind="privacy" locale="en" />
    </>
  );
}
