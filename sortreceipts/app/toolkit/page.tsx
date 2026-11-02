import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import ToolkitClient from "./toolkit-client";

export default async function ToolkitPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  return <ToolkitClient />;
}
