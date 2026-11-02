/**
 * 隐私政策、服务条款与联系页的排版。
 *
 * 复用指南页的 DocShell 与 SectionList：这三页的阅读场景是「翻到某一段确认一句话」，
 * 排版和长文一致就够了，另起一套样式只会让站内出现两种正文观感。
 */

import Link from "next/link";

import type { DocLocale } from "@/app/guide/content";
import { DocShell, SectionList } from "@/app/guide/view";

import { CONTACT_EMAIL, LEGAL_SUMMARY, LEGAL_TITLE, LEGAL_UPDATED, legalSections } from "./content";
import type { LegalKind } from "./content";
import { legalPath } from "./meta";

const READ_MINUTES: Record<LegalKind, number> = { privacy: 6, terms: 7, contact: 3 };

const LABELS: Record<DocLocale, Record<LegalKind | "guide" | "faq" | "about" | "related", string>> = {
  en: {
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    contact: "Contact",
    guide: "Guide",
    faq: "FAQ",
    about: "About",
    related: "Other pages",
  },
  zh: {
    privacy: "隐私政策",
    terms: "服务条款",
    contact: "联系我们",
    guide: "指南",
    faq: "常见问题",
    about: "关于",
    related: "其他页面",
  },
};

export function LegalView({ kind, locale }: { kind: LegalKind; locale: DocLocale }) {
  const labels = LABELS[locale];
  const others: LegalKind[] = (["privacy", "terms", "contact"] as LegalKind[]).filter((k) => k !== kind);

  return (
    <DocShell
      locale={locale}
      title={LEGAL_TITLE[kind][locale]}
      summary={LEGAL_SUMMARY[kind][locale]}
      readMinutes={READ_MINUTES[kind]}
      updated={LEGAL_UPDATED}
    >
      <SectionList sections={legalSections(kind)[locale]} />

      {kind === "contact" && (
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-8 inline-flex rounded-full bg-[#2563EB] px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          {locale === "zh" ? `写信到 ${CONTACT_EMAIL}` : `Email ${CONTACT_EMAIL}`}
        </a>
      )}

      <nav className="mt-12 rounded-2xl bg-[#F8FAFC] p-5" aria-label={labels.related}>
        <p className="text-[13px] font-bold uppercase tracking-wider text-[#64748B]">{labels.related}</p>
        <ul className="mt-3 space-y-2">
          {others.map((k) => (
            <li key={k}>
              <Link href={legalPath(k, locale)} className="text-[15px] font-semibold text-[#2563EB] hover:underline">
                {labels[k]}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={locale === "zh" ? "/zh/guide" : "/guide"}
              className="text-[15px] font-semibold text-[#2563EB] hover:underline"
            >
              {labels.guide}
            </Link>
          </li>
          <li>
            <Link
              href={locale === "zh" ? "/zh/faq" : "/faq"}
              className="text-[15px] font-semibold text-[#2563EB] hover:underline"
            >
              {labels.faq}
            </Link>
          </li>
          <li>
            <Link
              href={locale === "zh" ? "/zh/about" : "/about"}
              className="text-[15px] font-semibold text-[#2563EB] hover:underline"
            >
              {labels.about}
            </Link>
          </li>
        </ul>
      </nav>
    </DocShell>
  );
}
