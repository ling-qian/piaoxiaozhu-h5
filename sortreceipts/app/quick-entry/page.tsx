import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getProjects } from "@/lib/actions/project-actions";
import QuickEntryClient from "./quick-entry-client";

export default async function QuickEntryPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  // 记账必须挂在某个项目下。取第一个项目作为默认，
  // 用户只有一个项目时就不用选了；没有项目时页面会提示先创建。
  const projects = await getProjects().catch(() => []);
  const first = projects[0] ?? null;

  return <QuickEntryClient projectId={first?.id ?? null} projectName={first?.name ?? null} />;
}
