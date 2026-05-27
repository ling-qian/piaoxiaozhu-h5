import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProjects } from "@/lib/actions/project-actions";
import ReportClient from "./report-client";
import { PageSpinner } from "@/components/spinner";

export default async function ReportPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const projects = await getProjects();
  if (projects.length === 0) redirect("/");

  const defaultProjectId = projects[0].id;

  return (
    <Suspense fallback={<PageSpinner />}>
      <ReportClient projectId={defaultProjectId} projects={projects} />
    </Suspense>
  );
}
