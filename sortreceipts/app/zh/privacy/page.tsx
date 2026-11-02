import { LegalView } from "@/app/legal/view";
import { legalMetadata, legalStructuredData } from "@/app/legal/meta";

/** 隐私政策（中文） */
export const metadata = legalMetadata("privacy", "zh");

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(legalStructuredData("privacy", "zh")) }}
      />
      <LegalView kind="privacy" locale="zh" />
    </>
  );
}
