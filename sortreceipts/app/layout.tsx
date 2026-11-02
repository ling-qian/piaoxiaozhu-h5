import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import { ToastProvider } from "@/components/toast";
import { I18nProvider } from "@/lib/i18n";
import { NEXT_PUBLIC_BASE_URL, NEXT_PUBLIC_CF_ANALYTICS_TOKEN } from "@/lib/env";
import ServiceWorkerRegistrar from "@/components/sw-registrar";
import AppShell from "@/components/app-shell";
import "./globals.css";

/**
 * 站点元信息。
 *
 * 用英文而不是中文：H5 首发面向海外，这份元信息会被搜索引擎和社交平台抓取，
 * 它们不执行客户端 JS，读不到用户切换的语言。各语言落地页的标题和描述
 * 由 app/landing/metadata.ts 按路径分别生成。
 */
export const metadata: Metadata = {
  metadataBase: new URL(NEXT_PUBLIC_BASE_URL),
  title: "SortReceipts — Receipts and Costs for Small Restaurants",
  description:
    "Photo recognition, restaurant cost categories and monthly margin reports. An AI receipt tool for small restaurants, cafés and food trucks.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "SortReceipts — Receipts and Costs for Small Restaurants",
    description: "Photo recognition · Restaurant cost categories · Revenue and margin reports",
    type: "website",
    locale: "en_US",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SortReceipts",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2563EB",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 语言由 middleware 按路径算好放进请求头。`/` 和 `/es`、`/ja` 各自
  // 输出正确的 `<html lang>`，中文用 zh-CN，葡语用 pt-BR。
  const requestHeaders = await headers();
  const lang = requestHeaders.get("x-locale") || "en";

  return (
    <html lang={lang}>
      <body>
        {/* 统计脚本按令牌开关：没配令牌就不发请求，也不会拖慢首屏 */}
        {NEXT_PUBLIC_CF_ANALYTICS_TOKEN && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: NEXT_PUBLIC_CF_ANALYTICS_TOKEN })}
          />
        )}
        
          <I18nProvider>
            <ToastProvider>
              <ServiceWorkerRegistrar />
              <div className="mx-auto w-full max-w-mobile lg:max-w-none min-h-screen bg-page relative">
                <AppShell>{children}</AppShell>
              </div>
            </ToastProvider>
          </I18nProvider>
        
      </body>
    </html>
  );
}
