import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AdminUpgradeClient from "./admin-upgrade-client";

export default async function AdminUpgradePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user || user.email !== "admin@piaoxiaozhu.com") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <div className="text-center">
          <p className="text-lg text-[#999999]">无权限访问</p>
        </div>
      </div>
    );
  }

  const requests = await prisma.planUpgradeRequest.findMany({
    where: { status: "pending" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const reviewedRequests = await prisma.planUpgradeRequest.findMany({
    where: { status: { in: ["approved", "rejected"] } },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { reviewedAt: "desc" },
    take: 20,
  });

  return (
    <AdminUpgradeClient
      pendingRequests={JSON.parse(JSON.stringify(requests))}
      reviewedRequests={JSON.parse(JSON.stringify(reviewedRequests))}
    />
  );
}
