import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getSales } from "@/lib/actions/sales-actions";
import SalesView from "./sales-view";

/** 默认看本月：营业额是当月在记，不像交付包是月后才看 */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const params = await searchParams;
  const projectId = params.project ?? "";
  if (!projectId) redirect("/");

  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth();

  const data = await getSales(projectId, month).catch(() => null);
  if (!data) notFound();

  // key 按月重置表单：切月份后，输入框里的日期不该还停在旧月份
  return <SalesView key={`${projectId}-${month}`} projectId={projectId} data={data} />;
}
