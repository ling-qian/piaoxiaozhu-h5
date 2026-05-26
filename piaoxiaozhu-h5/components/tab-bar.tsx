"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const tabs = [
  { href: "/", label: "首页", icon: "🏠", activeIcon: "🏠", needProject: false },
  { href: "/upload", label: "上传", icon: "📷", activeIcon: "📷", needProject: true },
  { href: "/report", label: "报表", icon: "📊", activeIcon: "📊", needProject: true },
  { href: "/toolkit", label: "工具箱", icon: "📖", activeIcon: "📖", needProject: false },
  { href: "/mine", label: "我的", icon: "👤", activeIcon: "👤", needProject: false },
];

export default function TabBar({ projectId }: { projectId?: string }) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function getHref(tab: (typeof tabs)[number]): string {
    if (!tab.needProject || !projectId) return tab.href;
    return `${tab.href}?project=${projectId}`;
  }

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-mobile bg-white border-t border-[#EEEEEE] z-50">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={getHref(tab)}
              className={`flex flex-col items-center justify-center flex-1 h-full ${
                active ? "text-brand" : "text-[#999999]"
              }`}
            >
              <span className="text-lg">{active ? tab.activeIcon : tab.icon}</span>
              <span className="text-[10px] mt-0.5">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
