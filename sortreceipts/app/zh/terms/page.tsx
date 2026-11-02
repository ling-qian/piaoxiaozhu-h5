import { LegalView } from "@/app/legal/view";
import { legalMetadata, legalStructuredData } from "@/app/legal/meta";

/** 服务条款（中文） */
export const metadata = legalMetadata("terms", "zh");

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(legalStructuredData("terms", "zh")) }}
      />
      <LegalView kind="terms" locale="zh" />
    </>
  );
}
