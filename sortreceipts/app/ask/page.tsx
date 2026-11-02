import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import AskClient from "./ask-client";

export default async function AskPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  return <AskClient />;
}
