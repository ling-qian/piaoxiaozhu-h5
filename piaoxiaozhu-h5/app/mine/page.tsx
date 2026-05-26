import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserInfo } from "@/lib/actions/user-actions";
import MineClient from "./mine-client";

export default async function MinePage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = await getUserInfo();

  return <MineClient user={user} />;
}
