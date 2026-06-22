import { auth } from "@/lib/auth";
import PromoClient from "./promo-client";

export default async function PromoPage() {
  const session = await auth();
  const userId = session?.user?.id || null;

  return <PromoClient userId={userId} />;
}
