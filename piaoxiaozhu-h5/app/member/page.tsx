import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserInfo } from "@/lib/actions/user-actions";
import MemberClient from "./member-client";

export default async function MemberPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = await getUserInfo();
  if (!user) redirect("/auth/login");

  return <MemberClient currentPlan={user.planCode} />;
}
