import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getPack } from "@/lib/actions/pack-actions";
import PackView from "./pack-view";

/** 页面的默认月份：上一个自然月，会计按月结账 */
function lastMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
}

export default async function PackPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const params = await searchParams;
  const projectId = params.project ?? "";
  if (!projectId) redirect("/");

  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : lastMonth();

  // 项目不属于本人时后端回 404，这里统一按「页面不存在」处理，
  // 不把「你没有这个项目」和「网络挂了」混成同一个 500
  const pack = await getPack(projectId, month).catch(() => null);
  if (!pack) notFound();

  // key 按月重置组件状态：切月份后，旧的分享链接不该继续显示在新月份上
  return <PackView key={`${projectId}-${month}`} projectId={projectId} pack={pack} />;
}
