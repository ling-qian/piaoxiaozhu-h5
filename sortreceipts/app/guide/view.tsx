/**
 * 指南、子文与问答页的共享排版。
 *
 * 全部是静态文本，没有客户端交互：`<details>` 折叠由浏览器原生支持，
 * 不依赖 JS。AI 爬虫不执行脚本，折叠里的答案在 HTML 里就能读到。
 */

import Link from "next/link";

import { DOC_UPDATED, FAQ_ITEMS, GUIDE_SECTIONS, GUIDE_SUMMARY, GUIDE_TITLE } from "./content";
import type { DocLocale, DocFaq, DocSection } from "./content";
import { TOPICS, topicPath } from "./topics";
import type { DocTopic } from "./topics";

const HOME_PATH: Record<DocLocale, string> = { en: "/", zh: "/zh" };

const T = {
  en: {
    updated: "Updated",
    readTime: "min read",
    backHome: "Home",
    guideLink: "Full guide",
    faqLink: "All questions",
    startFree: "Start free",
    toc: "On this page",
    faqHeading: "Frequent questions",
    related: "Read next",
    ctaTitle: "Read your first receipt in about a minute",
    ctaBody:
      "The free plan covers 5 receipts a month and 1 project. No card required, no app to install.",
  },
  zh: {
    updated: "更新于",
    readTime: "分钟读完",
    backHome: "首页",
    guideLink: "完整指南",
    faqLink: "全部问题",
    startFree: "免费开始",
    toc: "本页目录",
    faqHeading: "常见问题",
    related: "继续阅读",
    ctaTitle: "第一张小票大约一分钟就能读完",
    ctaBody: "免费版每月 5 张、1 个项目。不用绑卡，不用装应用。",
  },
} as const;

export function DocShell({
  locale,
  title,
  summary,
  readMinutes = 12,
  updated = DOC_UPDATED,
  children,
}: {
  locale: DocLocale;
  title: string;
  summary: string;
  readMinutes?: number;
  /** 法务页有自己的更新日期，不跟指南同步 */
  updated?: string;
  children: React.ReactNode;
}) {
  const t = T[locale];
  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 overflow-x-clip bg-white text-[#0F172A]">
      <header className="border-b border-black/[0.06]">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href={HOME_PATH[locale]} className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="SortReceipts" width={32} height={32} className="h-8 w-8" />
            <span className="text-[15px] font-extrabold tracking-tight">SortReceipts</span>
          </Link>
          <Link
            href={HOME_PATH[locale]}
            className="text-sm font-medium text-[#475569] transition-colors hover:text-[#0F172A]"
          >
            {t.backHome}
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{title}</h1>
        <p className="mt-3 text-[13px] text-[#64748B]">
          {t.updated} {updated} · {readMinutes} {t.readTime}
        </p>
        <p className="mt-6 text-[15px] leading-7 text-[#334155]">{summary}</p>
        {children}
      </article>
    </div>
  );
}

export function SectionList({ sections }: { sections: DocSection[] }) {
  return (
    <>
      {sections.map((s, i) => (
        <section key={s.title} id={`s${i + 1}`} className="mt-10 scroll-mt-24">
          <h2 className="text-[20px] font-bold tracking-tight">{s.title}</h2>
          {s.lead && <p className="mt-3 text-[15px] font-semibold leading-7 text-[#1D4ED8]">{s.lead}</p>}
          {s.paragraphs?.map((p) => (
            <p key={p} className="mt-3 text-[15px] leading-7 text-[#334155]">
              {p}
            </p>
          ))}
          {s.bullets && (
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-[#334155]">
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {s.table && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="bg-[#F8FAFC] text-left">
                    {s.table.head.map((h) => (
                      <th key={h} className="border border-black/[0.06] px-3 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((row) => (
                    <tr key={row.join("|")}>
                      {row.map((cell) => (
                        <td key={cell} className="border border-black/[0.06] px-3 py-2 text-[#334155]">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </>
  );
}

export function FaqList({
  locale,
  items = FAQ_ITEMS,
  className = "",
}: {
  locale: DocLocale;
  items?: DocFaq[];
  className?: string;
}) {
  return (
    <div className={`divide-y divide-black/[0.06] ${className}`}>
      {items.map((item) => (
        <details key={item.q.en} className="group py-4" open>
          <summary className="cursor-pointer list-none text-[15px] font-semibold marker:hidden">
            {item.q[locale]}
          </summary>
          <p className="mt-2 text-[15px] leading-7 text-[#334155]">{item.a[locale]}</p>
        </details>
      ))}
    </div>
  );
}

export function Cta({ locale }: { locale: DocLocale }) {
  const t = T[locale];
  return (
    <section className="mt-12 rounded-2xl bg-[#2563EB] p-6 text-white">
      <h2 className="text-[18px] font-bold">{t.ctaTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-white/85">{t.ctaBody}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/auth/register"
          className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#1D4ED8] transition-opacity hover:opacity-90"
        >
          {t.startFree}
        </Link>
        <Link
          href={locale === "zh" ? "/zh/faq" : "/faq"}
          className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          {t.faqLink}
        </Link>
      </div>
    </section>
  );
}

/** 主题集群的内链区块：主指南列出三篇子文，子文列出另外两篇 */
export function TopicLinks({
  locale,
  currentSlug,
  className = "",
}: {
  locale: DocLocale;
  currentSlug?: string;
  className?: string;
}) {
  const t = T[locale];
  const others = currentSlug ? TOPICS.filter((x) => x.slug !== currentSlug) : TOPICS;

  return (
    <nav className={`mt-12 rounded-2xl bg-[#F8FAFC] p-5 ${className}`} aria-label={t.related}>
      <p className="text-[13px] font-bold uppercase tracking-wider text-[#64748B]">{t.related}</p>
      <ul className="mt-3 space-y-2">
        <li>
          <Link
            href={locale === "zh" ? "/zh/guide" : "/guide"}
            className="text-[15px] font-semibold text-[#2563EB] hover:underline"
          >
            {GUIDE_TITLE[locale]}
          </Link>
        </li>
        {others.map((topic) => (
          <li key={topic.slug}>
            <Link
              href={topicPath(topic.slug, locale)}
              className="text-[15px] font-semibold text-[#2563EB] hover:underline"
            >
              {topic.title[locale]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function GuideView({ locale }: { locale: DocLocale }) {
  const t = T[locale];
  const sections = GUIDE_SECTIONS[locale];

  return (
    <DocShell locale={locale} title={GUIDE_TITLE[locale]} summary={GUIDE_SUMMARY[locale]}>
      <nav className="mt-8 rounded-2xl bg-[#F8FAFC] p-5" aria-label={t.toc}>
        <p className="text-[13px] font-bold uppercase tracking-wider text-[#64748B]">{t.toc}</p>
        <ol className="mt-3 space-y-1.5 text-sm text-[#2563EB]">
          {sections.map((s, i) => (
            <li key={s.title}>
              <a href={`#s${i + 1}`} className="hover:underline">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <SectionList sections={sections} />

      <section id="faq" className="mt-12 scroll-mt-24">
        <h2 className="text-[20px] font-bold tracking-tight">{t.faqHeading}</h2>
        <FaqList locale={locale} />
      </section>

      <TopicLinks locale={locale} />
      <Cta locale={locale} />
    </DocShell>
  );
}

export function TopicView({ topic, locale }: { topic: DocTopic; locale: DocLocale }) {
  const t = T[locale];

  return (
    <DocShell locale={locale} title={topic.title[locale]} summary={topic.summary[locale]} readMinutes={6}>
      <SectionList sections={topic.sections[locale]} />

      <section id="faq" className="mt-12 scroll-mt-24">
        <h2 className="text-[20px] font-bold tracking-tight">{t.faqHeading}</h2>
        <FaqList locale={locale} items={topic.faq} />
      </section>

      <TopicLinks locale={locale} currentSlug={topic.slug} />
      <Cta locale={locale} />
    </DocShell>
  );
}

export function FaqView({ locale }: { locale: DocLocale }) {
  const t = T[locale];
  const title = locale === "zh" ? "常见问题" : "Frequent questions about receipt scanning";
  const summary =
    locale === "zh"
      ? "关于识别准确度、文件大小、分类、导出与数据删除的 18 个问题，每条都给出直接答案。"
      : "18 answers on scan accuracy, file size, categories, export and data deletion — each one stated directly, without a sales pitch.";

  return (
    <DocShell locale={locale} title={title} summary={summary} readMinutes={8}>
      <p className="mt-4 text-sm">
        <Link href={locale === "zh" ? "/zh/guide" : "/guide"} className="text-[#2563EB] hover:underline">
          {t.guideLink}
        </Link>
      </p>
      <FaqList locale={locale} className="mt-6" />
      <TopicLinks locale={locale} />
      <Cta locale={locale} />
    </DocShell>
  );
}
