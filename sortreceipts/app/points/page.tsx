import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getPointPackages, getPoints, getPointsLogs } from "@/lib/actions/points-actions";
import PointsClient from "./points-client";

export default async function PointsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  // 三个请求互不依赖，并发拿。任一失败都不该拖垮整页，
  // 所以分别 catch 成空值，由页面决定怎么呈现缺失的部分。
  const [summary, logs, packages] = await Promise.all([
    getPoints().catch(() => null),
    getPointsLogs(50).catch(() => ({ items: [], total: 0 })),
    getPointPackages().catch(() => []),
  ]);

  return <PointsClient summary={summary} logs={logs.items} total={logs.total} packages={packages} />;
}
