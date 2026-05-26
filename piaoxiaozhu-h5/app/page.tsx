import { getProjects } from "@/lib/actions/project-actions";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import HomeClient from "./home-client";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const projects = await getProjects();

  return <HomeClient projects={projects} />;
}
