"use client";

import { useEffect, useState } from "react";

import { NUMBER_LOCALE } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";

interface PageHeaderProps {
  title: string;
  /** 桌面标题栏用。手机上仍显示 title（首页那里是站点名） */
  desktopTitle?: string;
  /** 桌面副标题，一句话说明这页能做什么 */
  desktopSubtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  /** 首页用：左侧放站点图形标，没有返回键时才显示 */
  showLogo?: boolean;
  /** 桌面标题区右侧显示当天日期 */
  showDesktopDate?: boolean;
  rightAction?: React.ReactNode;
}

/**
 * 页面标题栏。
 *
 * 两种形态：
 * - 手机：品牌色渐变头 + 白色波浪过渡，是竖屏第一屏的视觉重心
 * - 桌面：不铺白底横条，标题直接落在页面底色上，副标题衬在标题下方，
 *   右侧放日期或本页操作。桌面屏幕宽，整条横幅会把页面压成一条，
 *   和侧边栏一起看很像放大的手机 App。
 */
export default function PageHeader({
  title,
  desktopTitle,
  desktopSubtitle,
  showBack,
  onBack,
  showLogo,
  showDesktopDate,
  rightAction,
}: PageHeaderProps) {
  const { locale } = useI18n();
  // 日期徽标必须在浏览器里算。服务端（Cloudflare Worker）按 UTC 取日期，
  // 跨过零点的那几个小时会比用户本地早一天；而且 React 水合时不会覆盖
  // 带 suppressHydrationWarning 的文本，错过的日期就一直停在屏幕上。
  // 改成挂载后按本地时区重算，顺带把星期几显示出来。
  const [dateText, setDateText] = useState("");
  useEffect(() => {
    const dateLocale = locale === "zh" ? "zh-CN" : NUMBER_LOCALE;
    setDateText(
      new Date().toLocaleDateString(dateLocale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    );
  }, [locale]);

  return (
    <>
      {/* ── 手机端 ── */}
      <div className="lg:hidden print:hidden" style={{ paddingTop: "calc(var(--safe-top) + 0px)" }}>
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-brand via-brand to-brand-dark" />

          <div className="absolute -top-20 -right-20 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-10 -left-16 w-40 h-40 bg-brand-dark/20 rounded-full blur-2xl" />
          <div className="absolute top-1/2 right-1/4 w-20 h-20 bg-white/5 rounded-full blur-xl" />

          <div className="relative px-4 pb-4">
            <div className="flex items-center justify-between h-11">
              {showBack ? (
                <button
                  onClick={onBack}
                  className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center btn-press transition-all active:bg-white/25"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] text-white">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              ) : showLogo ? (
                <div className="w-9 h-9 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-white.svg" alt="SortReceipts" width={28} height={28} className="w-7 h-7" />
                </div>
              ) : (
                <div className="w-9" />
              )}

              <h1 className="text-white text-[17px] font-semibold tracking-wide">{title}</h1>

              {rightAction ? <div>{rightAction}</div> : <div className="w-9" />}
            </div>
          </div>
        </div>

        <div className="relative -mt-px">
          <svg viewBox="0 0 400 16" fill="none" className="w-full block" preserveAspectRatio="none">
            <path d="M0 16V8C60 2 140 0 200 0C260 0 340 2 400 8V16H0Z" fill="#F8FAFC" />
          </svg>
        </div>
      </div>

      {/* ── 桌面端 ── */}
      <div className="hidden px-10 pt-8 lg:block">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            {showBack && (
              <button
                onClick={onBack}
                aria-label="Back"
                className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:text-[#0F172A]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <div>
              <h1 className="text-[26px] font-bold tracking-tight text-[#0F172A]">{desktopTitle ?? title}</h1>
              {desktopSubtitle && <p className="mt-1 text-sm text-[#64748B]">{desktopSubtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {rightAction}
            {showDesktopDate && dateText && (
              <span
                className="rounded-sm border border-[#E2E8F0] bg-white px-3.5 py-1.5 text-[13px] text-[#64748B]"
                suppressHydrationWarning
              >
                {dateText}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
