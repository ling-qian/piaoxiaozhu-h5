import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getRecordsForReport } from "@/lib/actions/record-actions";
import { getProjectById } from "@/lib/actions/project-actions";
import ReportClient from "./report-client";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const project = await getProjectById(id, session.user.id);
  if (!project) redirect("/");

  const records = await getRecordsForReport(id);

  return <ReportClient projectId={id} currency={project.currency} records={records} />;
}
