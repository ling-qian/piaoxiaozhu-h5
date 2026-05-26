import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProjectStats } from "@/lib/actions/project-actions";
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

  const stats = await getProjectStats(id);
  const { items: records } = await getRecords(id);

  return <ProjectDetailClient projectId={id} stats={stats} initialRecords={records} />;
}
