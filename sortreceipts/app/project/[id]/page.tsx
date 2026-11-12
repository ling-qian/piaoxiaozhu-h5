import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProjectStats, getProjectById, getProjectFindings } from "@/lib/actions/project-actions";
import { getRecords } from "@/lib/actions/record-actions";
import ProjectDetailClient from "./project-detail-client";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  // 检查项目是否存在且未删除
  const project = await getProjectById(id, session.user.id);
  if (!project) {
    redirect("/");
  }

  // 三个请求互不依赖，一起发，别串成三次往返
  const [stats, recordsPage, findings] = await Promise.all([
    getProjectStats(id),
    getRecords(id),
    getProjectFindings(id),
  ]);

  return (
    <ProjectDetailClient
      projectId={id}
      currency={project.currency}
      stats={stats}
      initialRecords={recordsPage.items}
      initialNextCursor={recordsPage.nextCursor}
      findings={findings}
    />
  );
}
