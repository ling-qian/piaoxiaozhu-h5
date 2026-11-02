import type { Metadata } from "next";

import { getProjects } from "@/lib/actions/project-actions";
import { auth } from "@/lib/auth";
import { ROOT_LOCALE } from "@/lib/locales";
import { landingMetadata } from "./landing/metadata";
import { landingStructuredData } from "./landing/structured-data";
import LandingView from "./landing/landing-view";
import HomeClient from "./home-client";

/**
 * 首页有两种形态：
 * - 已登录 → 直接进工作台（原来的首页）
 * - 未登录 → 落地页
 *
 * 落地页由服务端渲染：搜索引擎和 AI 抓取工具不执行页面里的 JS，
 * 只在客户端拼出来的内容它们看不到。其余语言挂在 `/{lang}` 上，
 * 参见 app/[lang]/page.tsx。
 */

export const metadata: Metadata = landingMetadata(ROOT_LOCALE);

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    const projects = await getProjects();
    return <HomeClient projects={projects} isLoggedIn />;
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingStructuredData(ROOT_LOCALE)) }}
      />
      <LandingView locale={ROOT_LOCALE} />
    </>
  );
}
