"use client";

/**
 * 应用外壳的桌面部分。
 *
 * 1024px 以上在左侧挂一条固定导航，手机上没有变化——顶部标题栏加底部标签
 * 才是单手能用的形态。营销页、登录注册、后台不进这个壳。
 *
 * 首页 `/` 是个例外：未登录时它是落地页，登录后才是工作台，而根布局读不到
 * 登录态。所以这里不处理 `/`，由首页自己带上 `force` 决定要不要侧边栏。
 */

import { usePathname } from "next/navigation";

import DesktopSidebar from "./desktop-sidebar";

const APP_PATHS = [
  "/analysis",
  "/ask",
  "/bill",
  "/checkin",
  "/member",
  "/mine",
  "/pack",
  "/points",
  "/project",
  "/quick-entry",
  "/report",
  "/result",
  "/sales",
  "/toolkit",
  "/upload",
];

function isAppPath(pathname: string): boolean {
  return APP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function AppShell({
  children,
  force = false,
}: {
  children: React.ReactNode;
  force?: boolean;
}) {
  const pathname = usePathname();
  if (!force && !isAppPath(pathname)) return <>{children}</>;

  return (
    <>
      <DesktopSidebar />
      <div className="lg:pl-[260px] print:pl-0">{children}</div>
    </>
  );
}
