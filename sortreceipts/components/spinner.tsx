"use client";

import { useI18n } from "@/lib/i18n";

export default function Spinner({ size = "md", text }: { size?: "sm" | "md" | "lg"; text?: string }) {
  const { t } = useI18n();
  const sizeMap = { sm: "w-5 h-5", md: "w-8 h-8", lg: "w-12 h-12" };
  const borderMap = { sm: "border-2", md: "border-[3px]", lg: "border-4" };

  return (
    <div className="flex flex-col items-center justify-center gap-3" role="status" aria-label={text || t("common.loading")}>
      <div
        className={`${sizeMap[size]} ${borderMap[size]} border-brand/20 border-t-brand rounded-full animate-spin`}
        aria-hidden="true"
      />
      {text && <p className="text-sm text-[#64748B]">{text}</p>}
    </div>
  );
}

export function PageSpinner({ text }: { text?: string }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="md" text={text ?? t("common.loading")} />
    </div>
  );
}

export function InlineSpinner() {
  const { t } = useI18n();
  return (
    <div className="inline-flex items-center gap-2" role="status" aria-label={t("common.loading")}>
      <div className="w-4 h-4 border-2 border-brand/20 border-t-brand rounded-full animate-spin" aria-hidden="true" />
    </div>
  );
}
