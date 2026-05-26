"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import PageHeader from "@/components/page-header";
import TabBar from "@/components/tab-bar";

interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  planCode: string;
  quotaTotal: number;
  quotaUsed: number;
  createdAt: Date;
}

export default function MineClient({ user }: { user: User | null }) {
  const router = useRouter();

  const quotaPercent = user
    ? Math.round((user.quotaUsed / user.quotaTotal) * 100)
    : 0;

  return (
    <div className="pb-16">
      <PageHeader title="我的" />

      <div className="px-4 -mt-4 space-y-4">
        <div className="bg-white rounded-md p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-brand/10 rounded-full flex items-center justify-center text-2xl">
              👤
            </div>
            <div>
              <p className="font-medium text-[#333333]">
                {user?.name || "用户"}
              </p>
              <p className="text-xs text-[#999999]">{user?.email}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-md p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#666666]">本月配额</span>
            <span className="text-sm text-brand">
              {user?.quotaUsed || 0}/{user?.quotaTotal || 10}
            </span>
          </div>
          <div className="w-full h-2 bg-[#EEEEEE] rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all"
              style={{ width: `${quotaPercent}%` }}
            />
          </div>
          <button
            onClick={() => router.push("/member")}
            className="text-xs text-brand mt-2"
          >
            升级套餐 →
          </button>
        </div>

        <div className="bg-white rounded-md shadow-card divide-y divide-[#EEEEEE]">
          <button
            onClick={() => router.push("/member")}
            className="w-full flex items-center justify-between px-4 py-3 text-sm"
          >
            <span>会员套餐</span>
            <span className="text-[#999999]">→</span>
          </button>
          <button
            onClick={() => router.push("/toolkit")}
            className="w-full flex items-center justify-between px-4 py-3 text-sm"
          >
            <span>工具箱</span>
            <span className="text-[#999999]">→</span>
          </button>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
          className="w-full bg-white text-error py-3 rounded-md shadow-card text-sm font-medium"
        >
          退出登录
        </button>
      </div>

      <TabBar />
    </div>
  );
}
