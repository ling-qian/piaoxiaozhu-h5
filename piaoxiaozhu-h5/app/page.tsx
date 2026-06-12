import { getProjects } from "@/lib/actions/project-actions";
import { auth } from "@/lib/auth";
import HomeClient from "./home-client";

export default async function HomePage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  const projects = isLoggedIn ? await getProjects() : [];

  return <HomeClient projects={projects} isLoggedIn={isLoggedIn} />;
}
