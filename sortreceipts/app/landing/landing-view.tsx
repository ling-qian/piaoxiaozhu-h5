import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Languages,
  ScanLine,
  Sparkles,
  Tags,
} from "lucide-react";

import { formatPrice } from "@/lib/currency";
import {
  LANDING_LOCALES,
  landingPath,
  type LandingLocale,
} from "@/lib/locales";
import { CATEGORY_LIST, HOW_STEPS, faqFor } from "./content";
import { LANDING_STRINGS, LOCALE_META } from "./i18n";

/**
 * 落地页本体。
 *
 * ## 为什么是服务端组件
 *
 * 每种语言各自是一个 URL，页面在服务端就按该语言渲染成完整 HTML。
 * 搜索引擎和 AI 抓取工具不执行页面里的 JS，只有服务端输出的文字算数。
 * 浏览器里再切换语言会改地址，所以这里也不需要客户端的语言状态。
 *
 * ## 为什么用负偏移铺满全宽
 *
 * 根布局把所有页面都套在 `max-w-mobile`（430px）里，那是给手机上用的 App 外壳。
 * 落地页在桌面端需要整屏宽度，所以在自己这一层用 `w-screen + 平移` 抵掉父级约束。
 * 改根布局会影响十几个业务页面，不动它更安全。
 */

const DEMO_ROWS = [
  { vendor: "Fresh Produce Co.", amount: 412.8, cat: 0, icon: "🥬" },
  { vendor: "DoorDash", amount: 96.3, cat: 4, icon: "🛵" },
  { vendor: "City Utilities", amount: 148.2, cat: 3, icon: "💡" },
];

const BAR_HEIGHTS = [38, 52, 30, 64, 46, 72];

function SectionTitle({
  eyebrow,
  title,
  sub,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${dark ? "text-brand-light" : "text-brand"}`}>
        {eyebrow}
      </p>
      <h2
        className={`mt-3 text-3xl font-extrabold leading-tight tracking-[-0.02em] sm:text-4xl ${
          dark ? "text-white" : "text-[#0F172A]"
        }`}
      >
        {title}
      </h2>
      <p className={`mt-4 text-base leading-relaxed ${dark ? "text-white/60" : "text-[#475569]"}`}>{sub}</p>
    </div>
  );
}

/** 首屏右侧的产品示意：一张月度汇总卡 + 一张斜放的票据 */
function ProductDemo({ locale }: { locale: LandingLocale }) {
  const s = LANDING_STRINGS[locale];

  return (
    <div className="relative mx-auto w-full max-w-[430px] px-2 sm:px-0">
      {/* 背后那张斜放的票据 */}
      <div className="absolute -left-6 -top-6 hidden w-32 -rotate-6 rounded-xl border border-black/5 bg-white p-3 shadow-[0_16px_40px_-18px_rgba(16,24,40,0.4)] sm:block">
        <div className="mb-2 h-1.5 w-10 rounded-full bg-[#2563EB]/70" />
        <div className="space-y-1.5">
          <div className="h-1 w-full rounded-full bg-[#0F172A]/10" />
          <div className="h-1 w-3/4 rounded-full bg-[#0F172A]/10" />
          <div className="h-1 w-5/6 rounded-full bg-[#0F172A]/10" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="h-1 w-8 rounded-full bg-[#0F172A]/10" />
          <div className="text-[10px] font-bold text-[#0F172A]">{formatPrice(62.1, 62.1)}</div>
        </div>
      </div>

      {/* 主卡片 */}
      <div className="relative rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-[0_30px_70px_-30px_rgba(16,24,40,0.45)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#94A3B8]">{s.demoMonth}</p>
            <p className="mt-1 text-[11px] text-[#475569]">{s.demoTotal}</p>
            <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-[#0F172A]">
              {formatPrice(1284.5, 1284.5)}
            </p>
          </div>
          <span className="rounded-full bg-[#2563EB]/10 px-2.5 py-1 text-[10px] font-semibold text-[#1D4ED8]">
            {s.demoFiled}
          </span>
        </div>

        {/* 柱状趋势 */}
        <div className="mt-5 flex h-24 items-end gap-2">
          {BAR_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t-md ${i === BAR_HEIGHTS.length - 1 ? "bg-[#2563EB]" : "bg-[#2563EB]/20"}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>

        <div className="mt-5 space-y-2.5">
          {DEMO_ROWS.map((row) => (
            <div key={row.vendor} className="flex items-center gap-3 rounded-xl bg-[#F8FAFC] px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sm shadow-sm">
                {row.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[#0F172A]">{row.vendor}</p>
                <p className="truncate text-[10px] text-[#64748B]">{CATEGORY_LIST[row.cat][locale]}</p>
              </div>
              <span className="text-[13px] font-bold text-[#0F172A]">{formatPrice(row.amount, row.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 语言切换：一组普通链接，每一页都是独立 URL，爬虫顺着链接就能发现其余语言 */
function LocaleSwitcher({ locale }: { locale: LandingLocale }) {
  const s = LANDING_STRINGS[locale];

  return (
    <details className="relative">
      <summary
        aria-label={s.langSwitch}
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-black/[0.08] px-2.5 py-1.5 text-xs font-semibold text-[#475569] transition-colors hover:border-black/20 hover:text-[#0F172A] [&::-webkit-details-marker]:hidden"
      >
        <Languages className="h-3.5 w-3.5 shrink-0" />
        {/* 窄屏只留图标：中文名、日本語这类标签会把右上角挤成两行 */}
        <span className="hidden sm:inline">{LOCALE_META[locale].label}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-black/[0.08] bg-white p-1 shadow-[0_16px_40px_-16px_rgba(16,24,40,0.35)]">
        {LANDING_LOCALES.map((l) => (
          <a
            key={l}
            href={landingPath(l)}
            hrefLang={l}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              l === locale ? "bg-brand/10 text-[#1D4ED8]" : "text-[#475569] hover:bg-black/[0.04] hover:text-[#0F172A]"
            }`}
          >
            {LOCALE_META[l].label}
            {l === locale && <Check className="h-3.5 w-3.5" />}
          </a>
        ))}
      </div>
    </details>
  );
}

export default function LandingView({ locale }: { locale: LandingLocale }) {
  const s = LANDING_STRINGS[locale];

  const features = [
    { icon: Camera, title: s.f1Title, desc: s.f1Desc },
    { icon: Tags, title: s.f2Title, desc: s.f2Desc },
    { icon: FileSpreadsheet, title: s.f3Title, desc: s.f3Desc },
    { icon: Sparkles, title: s.f4Title, desc: s.f4Desc },
  ];

  const stats = [
    { value: s.stat1Value, label: s.stat1Label },
    { value: s.stat2Value, label: s.stat2Label },
    { value: s.stat3Value, label: s.stat3Label },
    { value: s.stat4Value, label: s.stat4Label },
  ];

  const steps = HOW_STEPS.map((step, i) => ({
    no: String(i + 1).padStart(2, "0"),
    title: step.title[locale],
    desc: step.text[locale],
  }));

  const values = [
    { title: s.v1Title, desc: s.v1Desc },
    { title: s.v2Title, desc: s.v2Desc },
    { title: s.v3Title, desc: s.v3Desc },
    { title: s.v4Title, desc: s.v4Desc },
  ];

  const plans = [
    {
      name: s.planFree,
      note: s.planFreeNote,
      price: s.freeLabel,
      monthly: false,
      bullets: [s.planFreeB1, s.planFreeB2, s.planFreeB3],
      cta: s.ctaFree,
      featured: false,
    },
    {
      name: s.planPro,
      note: s.planProNote,
      price: formatPrice(29, 3.99),
      monthly: true,
      bullets: [s.planProB1, s.planProB2, s.planProB3, s.planProB4],
      cta: s.ctaPro,
      featured: true,
    },
    {
      name: s.planBiz,
      note: s.planBizNote,
      price: formatPrice(99, 13.99),
      monthly: true,
      bullets: [s.planBizB1, s.planBizB2, s.planBizB3, s.planBizB4],
      cta: s.ctaBiz,
      featured: false,
    },
  ];

  const faqs = faqFor(locale);

  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 overflow-x-clip bg-white text-[#0F172A]">
      {/* ── 顶部导航 ─────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href={landingPath(locale)} className="flex shrink-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="SortReceipts" width={34} height={34} className="h-[34px] w-[34px]" />
            <span className="text-[15px] font-extrabold tracking-tight">SortReceipts</span>
          </a>

          <nav className="hidden items-center gap-8 text-sm font-medium text-[#475569] md:flex" aria-label="Main">
            <a href="#features" className="transition-colors hover:text-[#0F172A]">{s.navFeatures}</a>
            <a href="#how" className="transition-colors hover:text-[#0F172A]">{s.navHow}</a>
            <a href="#pricing" className="transition-colors hover:text-[#0F172A]">{s.navPricing}</a>
            <a href="#faq" className="transition-colors hover:text-[#0F172A]">{s.navFaq}</a>
          </nav>

          <div className="flex items-center gap-2">
            <LocaleSwitcher locale={locale} />
            <a
              href="/auth/login"
              className="hidden px-3 py-1.5 text-sm font-medium text-[#475569] transition-colors hover:text-[#0F172A] sm:inline-flex"
            >
              {s.navSignin}
            </a>
            <a
              href="/auth/register"
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-3 py-2 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.7)] transition-transform hover:-translate-y-0.5 sm:px-4"
            >
              {s.navStart}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      {/* ── 首屏 ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(75%_55%_at_45%_0%,#E0EAFF_0%,#FFFFFF_62%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(11,18,32,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(11,18,32,0.045)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(60%_60%_at_50%_25%,#000_20%,transparent_100%)]" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-16 pt-12 lg:grid-cols-[1.04fr_0.96fr] lg:pb-24 lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-[#1D4ED8] backdrop-blur">
              <ScanLine className="h-3.5 w-3.5" />
              {s.badge}
            </span>

            <h1 className="mt-6 max-w-[15ch] text-[2.15rem] font-extrabold leading-[1.05] tracking-[-0.035em] [text-wrap:balance] sm:text-5xl lg:text-[3.45rem]">
              {s.h1}
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#475569] sm:text-lg">{s.sub}</p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href="/auth/register"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3.5 text-sm font-bold text-white shadow-[0_14px_30px_-12px_rgba(37,99,235,0.85)] transition-transform hover:-translate-y-0.5"
              >
                {s.ctaPrimary}
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-6 py-3.5 text-sm font-semibold text-[#0F172A] transition-colors hover:border-black/20"
              >
                {s.ctaSecondary}
              </a>
            </div>

            <p className="mt-4 text-xs text-[#64748B]">{s.ctaNote}</p>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-[#475569]">
              {[s.proof1, s.proof2, s.proof3].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <ProductDemo locale={locale} />
        </div>
      </section>

      {/* ── 数字条 ───────────────────────────────────────── */}
      <section className="border-y border-black/[0.06] bg-white" aria-label="Product facts">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-10 sm:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label}>
              <p className="text-3xl font-extrabold tracking-tight text-[#0F172A]">{item.value}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#64748B]">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 解决什么问题 ─────────────────────────────────── */}
      <section className="bg-[#EFF6FF] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionTitle eyebrow={s.valueEyebrow} title={s.valueTitle} sub={s.valueSub} />

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {values.map((v) => (
              <div key={v.title} className="rounded-2xl border border-black/[0.06] bg-white p-6">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[#1D4ED8]">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-[#0F172A]">{v.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#475569]">{v.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-sm text-[#64748B]">{s.valueFit}</p>
        </div>
      </section>

      {/* ── 功能 ─────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20 bg-[#F8FAFC] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionTitle eyebrow={s.featuresEyebrow} title={s.featuresTitle} sub={s.featuresSub} />

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-black/[0.06] bg-white p-6 transition-shadow hover:shadow-[0_18px_40px_-24px_rgba(16,24,40,0.45)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#1D4ED8]">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-base font-bold text-[#0F172A]">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#475569]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 三步 ─────────────────────────────────────────── */}
      <section id="how" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionTitle eyebrow={s.howEyebrow} title={s.howTitle} sub={s.howSub} />

          <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-6">
            {steps.map((step) => (
              <div key={step.no} className="border-t border-black/[0.08] pt-6">
                <p className="text-4xl font-extrabold tracking-tight text-brand">{step.no}</p>
                <h3 className="mt-4 text-base font-bold text-[#0F172A]">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#475569]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 分类 ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0F172A] py-20 text-white">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-brand/25 blur-[100px]" />
        <div className="relative mx-auto max-w-6xl px-5">
          <SectionTitle eyebrow={s.catEyebrow} title={s.catTitle} sub={s.catSub} dark />

          <ul className="mt-10 flex flex-wrap gap-2.5">
            {CATEGORY_LIST.map((c, i) => (
              <li
                key={i}
                className={`rounded-full border px-4 py-2 text-sm ${
                  i === CATEGORY_LIST.length - 1
                    ? "border-white/10 bg-transparent text-white/40"
                    : "border-white/[0.12] bg-white/[0.06] text-white/85"
                }`}
              >
                {c[locale]}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 价格 ─────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-20 bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionTitle eyebrow={s.pricingEyebrow} title={s.pricingTitle} sub={s.pricingSub} />

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-3xl border p-7 ${
                  plan.featured
                    ? "border-brand bg-[#EFF6FF] shadow-[0_24px_60px_-30px_rgba(37,99,235,0.55)]"
                    : "border-black/[0.08] bg-white"
                }`}
              >
                {plan.featured && (
                  <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    {s.popular}
                  </span>
                )}
                <p className="text-sm font-bold text-[#0F172A]">{plan.name}</p>
                <p className="text-[11px] text-[#64748B]">{plan.note}</p>

                <div className="mt-5 flex items-baseline gap-1">
                  <span className={`text-4xl font-extrabold tracking-tight ${plan.featured ? "text-brand" : "text-[#0F172A]"}`}>
                    {plan.price}
                  </span>
                  {plan.monthly && <span className="text-xs text-[#64748B]">{s.perMonth}</span>}
                </div>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-sm text-[#475569]">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${plan.featured ? "text-brand" : "text-[#94A3B8]"}`} />
                      {bullet}
                    </li>
                  ))}
                </ul>

                <a
                  href="/auth/register"
                  className={`mt-8 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-bold transition-transform hover:-translate-y-0.5 ${
                    plan.featured
                      ? "bg-brand text-white shadow-[0_12px_26px_-10px_rgba(37,99,235,0.8)]"
                      : "border border-black/[0.1] bg-white text-[#0F172A]"
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs text-[#64748B]">{s.pricingNote}</p>
        </div>
      </section>

      {/* ── 常见问题 ─────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-20 bg-[#F8FAFC] py-20">
        <div className="mx-auto max-w-3xl px-5">
          <SectionTitle eyebrow="FAQ" title={s.faqTitle} sub={s.faqSub} />

          <div className="mt-10 divide-y divide-black/[0.07] rounded-2xl border border-black/[0.06] bg-white">
            {faqs.map((item) => (
              <details key={item.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-[#0F172A] [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-[#64748B] transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[#475569]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── 结尾行动区 ───────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0F172A] py-20 text-center text-white">
        <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand/30 blur-[110px]" />
        <div className="relative mx-auto max-w-2xl px-5">
          <h2 className="text-3xl font-extrabold leading-tight tracking-[-0.02em] sm:text-4xl">{s.finalTitle}</h2>
          <p className="mt-4 text-base text-white/65">{s.finalSub}</p>
          <a
            href="/auth/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3.5 text-sm font-bold text-white shadow-[0_16px_40px_-14px_rgba(37,99,235,0.9)] transition-transform hover:-translate-y-0.5"
          >
            {s.finalCta}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* ── 页脚 ─────────────────────────────────────────── */}
      <footer className="bg-[#0B1220] py-12 text-white/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-white.svg" alt="SortReceipts" width={28} height={28} className="h-7 w-7" />
              <span className="text-sm font-bold text-white">SortReceipts</span>
            </div>
            <p className="mt-3 text-xs">{s.footerTagline}</p>
          </div>

          <nav className="flex flex-wrap gap-x-8 gap-y-3 text-xs font-medium" aria-label="Footer">
            <a href="#features" className="transition-colors hover:text-white">{s.navFeatures}</a>
            <a href="#pricing" className="transition-colors hover:text-white">{s.navPricing}</a>
            <a href="#faq" className="transition-colors hover:text-white">{s.navFaq}</a>
            {/* 长文与问答独立成页，页脚给一条入口：爬虫从落地页能走到有正文的页面 */}
            <a href={locale === "zh" ? "/zh/guide" : "/guide"} className="transition-colors hover:text-white">
              {locale === "zh" ? "指南" : "Guide"}
            </a>
            <a href={locale === "zh" ? "/zh/faq" : "/faq"} className="transition-colors hover:text-white">
              {locale === "zh" ? "常见问题" : "FAQ"}
            </a>
            <a href={locale === "zh" ? "/zh/about" : "/about"} className="transition-colors hover:text-white">
              {locale === "zh" ? "关于" : "About"}
            </a>
            {/* 法务页放在页脚：社区和推广平台会翻到这里，找不到会直接扣分 */}
            <a href={locale === "zh" ? "/zh/privacy" : "/privacy"} className="transition-colors hover:text-white">
              {locale === "zh" ? "隐私政策" : "Privacy"}
            </a>
            <a href={locale === "zh" ? "/zh/terms" : "/terms"} className="transition-colors hover:text-white">
              {locale === "zh" ? "服务条款" : "Terms"}
            </a>
            <a href={locale === "zh" ? "/zh/contact" : "/contact"} className="transition-colors hover:text-white">
              {locale === "zh" ? "联系我们" : "Contact"}
            </a>
            <a href="/auth/login" className="transition-colors hover:text-white">{s.navSignin}</a>
            <a href="/auth/register" className="transition-colors hover:text-white">{s.navStart}</a>
          </nav>
        </div>

        {/* 页脚也放一份语言链接：爬虫从任一语言页都能走到其余七种 */}
        <div className="mx-auto mt-8 max-w-6xl px-5">
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-white/40" aria-label="Languages">
            {LANDING_LOCALES.map((l) => (
              <a key={l} href={landingPath(l)} hrefLang={l} className="transition-colors hover:text-white/80">
                {LOCALE_META[l].label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mx-auto mt-6 max-w-6xl px-5">
          <p className="text-[11px] text-white/35">{s.footerRights}</p>
        </div>
      </footer>
    </div>
  );
}
