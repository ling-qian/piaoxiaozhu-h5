import Link from "next/link";

import { ABOUT_FACTS, ABOUT_SECTIONS, ABOUT_SUMMARY, ABOUT_TITLE } from "@/app/about/content";
import { DocShell, SectionList } from "@/app/guide/view";
import type { DocLocale } from "@/app/guide/content";

/** 关于页的正文。两种语言共用，避免同一段说明写两遍再慢慢漂移 */
export function AboutView({ locale }: { locale: DocLocale }) {
  const sections = ABOUT_SECTIONS[locale].map((s) => ({ title: s.title, paragraphs: s.paragraphs }));
  const factsHeading = locale === "zh" ? "事实清单" : "At a glance";
  const moreHeading = locale === "zh" ? "继续了解" : "Read more";

  return (
    <DocShell locale={locale} title={ABOUT_TITLE[locale]} summary={ABOUT_SUMMARY[locale]} readMinutes={4}>
      <SectionList sections={sections} />

      <section className="mt-10">
        <h2 className="text-[20px] font-bold tracking-tight">{factsHeading}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <tbody>
              {ABOUT_FACTS.map((fact) => (
                <tr key={fact.label.en}>
                  <th className="w-[38%] border border-black/[0.06] bg-[#F8FAFC] px-3 py-2 text-left font-semibold">
                    {fact.label[locale]}
                  </th>
                  <td className="border border-black/[0.06] px-3 py-2 text-[#334155]">{fact.value[locale]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <nav className="mt-10 rounded-2xl bg-[#F8FAFC] p-5" aria-label={moreHeading}>
        <p className="text-[13px] font-bold uppercase tracking-wider text-[#64748B]">{moreHeading}</p>
        <ul className="mt-3 space-y-2 text-[15px] font-semibold text-[#2563EB]">
          <li>
            <Link href={locale === "zh" ? "/zh/guide" : "/guide"} className="hover:underline">
              {locale === "zh" ? "票据识别与记账指南" : "Receipt scanning and expense tracking guide"}
            </Link>
          </li>
          <li>
            <Link href={locale === "zh" ? "/zh/faq" : "/faq"} className="hover:underline">
              {locale === "zh" ? "常见问题" : "Frequently asked questions"}
            </Link>
          </li>
        </ul>
      </nav>
    </DocShell>
  );
}
