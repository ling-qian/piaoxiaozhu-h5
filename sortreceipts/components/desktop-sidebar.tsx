"use client";

/**
 * 桌面端左侧导航。
 *
 * 只在 lg（1024px）以上出现。手机上仍用底部标签栏——那是单手能碰到的地方，
 * 换成侧边栏反而更难按。
 *
 * 结构参考 TaxHacker：顶部品牌、一个上传主按钮、下面按组放导航，
 * 底部放套餐入口与版权。主按钮单独拿出来，是因为「上传票据」是最高频的动作，
 * 不该混在导航列表里和其他入口同权重。
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS, isNavActive } from "./nav-items";

const UPLOAD_ITEM = NAV_ITEMS.find((item) => item.href === "/upload")!;

export default function DesktopSidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-[#E2E8F0] bg-white lg:flex print:hidden"
      aria-label="Main navigation"
    >
      <Link href="/" className="flex items-center gap-2.5 px-3 pb-6 pt-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="SortReceipts" width={36} height={36} className="h-9 w-9" />
        <span className="text-[17px] font-bold tracking-tight text-[#0F172A]">SortReceipts</span>
      </Link>

      <div className="px-1">
        <Link
          href={UPLOAD_ITEM.href}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {t("upload.title")}
        </Link>
      </div>

      <nav className="mt-4 flex-1 space-y-1 px-1">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
          {t("nav.workspace")}
        </p>
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-brand-bg font-semibold text-brand"
                  : "font-medium text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              }`}
            >
              {item.icon}
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-[#E2E8F0] px-1 pt-3 pb-2">
        <Link
          href="/member"
          className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium text-[#475569] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
            <path d="M12 2l2.6 7.2h7.4l-6 4.5 2.3 7.1-6.3-4.4-6.3 4.4 2.3-7.1-6-4.5h7.4z" />
          </svg>
          {t("member.title")}
        </Link>
        <p className="px-3 pt-1 text-[11px] text-[#94A3B8]">© 2026 SortReceipts</p>
      </div>
    </aside>
  );
}
