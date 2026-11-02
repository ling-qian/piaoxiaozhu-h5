import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { SHOW_CHECKIN } from "@/lib/region";
import { getCheckinCalendar } from "@/lib/actions/points-actions";
import CheckinClient from "./checkin-client";

export default async function CheckinPage() {
  // 海外版不提供签到。直接访问这个地址时转去积分页，
  // 相比渲染一个「功能未开放」的空页，回到有内容的地方体验更好。
  if (!SHOW_CHECKIN) redirect("/points");

  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  // 拿不到日历也不要跳走：页面上签到按钮本身仍有意义，
  // 只是日历空白。整页 500 的代价比缺一块日历大得多。
  const calendar = await getCheckinCalendar().catch(() => null);

  return <CheckinClient initial={calendar} />;
}
