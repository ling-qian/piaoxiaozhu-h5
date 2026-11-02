"use client";

/**
 * 手机端底部标签栏。
 *
 * 导航项与桌面侧边栏共用 components/nav-items.tsx 这一份。
 * 1024px 以上隐藏，那边改用左侧固定导航。
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "@/lib/i18n";
import { NAV_ITEMS, isNavActive } from "./nav-items";

export default function TabBar({ projectId }: { projectId?: string }) {
  const pathname = usePathname();
  const { t } = useI18n();

  function getHref(href: string, needProject: boolean): string {
    if (!needProject || !projectId) return href;
    return `${href}?project=${projectId}`;
  }

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-mobile bg-white border-t border-[#E2E8F0] z-50 lg:hidden"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <div className="flex items-center justify-around h-14">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={getHref(item.href, item.needProject)}
              className={`relative flex flex-col items-center justify-center flex-1 h-full transition-colors duration-200 ${
                active ? "text-brand" : "text-[#64748B]"
              }`}
            >
              <span
                className={`absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand rounded-full transition-opacity duration-300 ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
              <span className={`transition-transform duration-200 ${active ? "scale-110" : ""}`}>
                {item.icon}
              </span>
              <span className={`text-[10px] mt-0.5 transition-all duration-200 ${active ? "font-medium" : ""}`}>
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
