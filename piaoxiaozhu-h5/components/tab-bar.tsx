"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "首页", icon: "🏠", activeIcon: "🏠" },
  { href: "/upload", label: "上传", icon: "📷", activeIcon: "📷" },
  { href: "/report", label: "报表", icon: "📊", activeIcon: "📊" },
  { href: "/toolkit", label: "工具箱", icon: "📖", activeIcon: "📖" },
  { href: "/mine", label: "我的", icon: "👤", activeIcon: "👤" },
];

export default function TabBar() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-mobile bg-white border-t border-[#EEEEEE] z-50">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
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
