import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProjectStats, getProjectById } from "@/lib/actions/project-actions";
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

  const stats = await getProjectStats(id);
  const { items: records, nextCursor } = await getRecords(id);

  return <ProjectDetailClient projectId={id} stats={stats} initialRecords={records} initialNextCursor={nextCursor} />;
}
