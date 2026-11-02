import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getRecordsForReport } from "@/lib/actions/record-actions";
import ReportClient from "./report-client";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const records = await getRecordsForReport(id);

  return <ReportClient projectId={id} records={records} />;
}
