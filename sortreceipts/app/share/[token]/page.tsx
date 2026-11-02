import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSharedPack } from "@/lib/actions/pack-actions";
import PackView from "@/app/pack/pack-view";

/**
 * 只读分享页。
 *
 * 令牌本身就是凭据，所以这条路由不要求登录（middleware 里单独放行）。
 * 页面不索引：链接里有别人的账目，不该进搜索引擎。
 */
export const metadata: Metadata = {
  title: "Monthly bookkeeping pack",
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await getSharedPack(token).catch(() => null);
  if (!shared) notFound();

  return (
    <PackView
      projectName={shared.project_name}
      pack={{ ...shared.pack, project_name: shared.project_name, share: null }}
      readOnly
    />
  );
}
