"use client";

import { useI18n } from "@/lib/i18n";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    console.error("[GlobalError]", error);
    // Sentry上报 — 仅在配置了DSN时生效
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/browser").then((Sentry) => {
        Sentry.captureException(error);
      });
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="text-5xl mb-4">😵</div>
      <h2 className="text-lg font-semibold text-[#0F172A] mb-2">{t("error.title")}</h2>
      <p className="text-sm text-[#64748B] mb-6">
        {error.message || t("error.message")}
      </p>
      <button
        onClick={reset}
        className="bg-brand text-white px-6 py-2.5 rounded-xl text-sm font-medium btn-press"
      >
        {t("error.reload")}
      </button>
    </div>
  );
}
