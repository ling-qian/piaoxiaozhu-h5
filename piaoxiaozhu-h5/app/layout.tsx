import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import { Analytics } from "@vercel/analytics/react";
import { ToastProvider } from "@/components/toast";
import ServiceWorkerRegistrar from "@/components/sw-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "票小助 - 餐饮票据智能整理",
  description: "拍照识别 · 自动分类 · 报表统计，AI驱动的餐饮票据识别与分类管理工具",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    title: "票小助 - 餐饮票据智能整理",
    description: "拍照识别 · 自动分类 · 报表统计",
    type: "website",
    locale: "zh_CN",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "票小助",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FF6B35",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <SessionProvider>
          <ToastProvider>
            <ServiceWorkerRegistrar />
            <div className="mx-auto max-w-mobile min-h-screen bg-page relative">
              {children}
            </div>
            <Analytics />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
