"use client";

import { useI18n } from "@/lib/i18n";
import Link from "next/link";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-page">
      <div className="text-center animate-fade-in-up">
        <div className="text-7xl font-bold text-brand/20 mb-2">404</div>
        <h2 className="text-lg font-semibold text-[#0F172A] mb-2">{t("notFound.title")}</h2>
        <p className="text-sm text-[#64748B] mb-6">
          {t("notFound.desc")}
        </p>
        <Link
          href="/"
          className="inline-block bg-brand text-white px-8 py-2.5 rounded-xl text-sm font-medium btn-press"
        >
          {t("notFound.backHome")}
        </Link>
      </div>
    </div>
  );
}
