"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useToast } from "@/components/toast";
import PageHeader from "@/components/page-header";
import TabBar from "@/components/tab-bar";

interface UserInfo {
  name: string | null;
  email: string | null;
}

export default function MineClient({ user }: { user: UserInfo }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await signOut({ callbackUrl: "/auth/login" });
    } catch {
      showToast("退出失败", "error");
      setLoggingOut(false);
    }
  }

  return (
    <div className="pb-16">
      <PageHeader title="我的" />

      <div className="px-4 -mt-4 space-y-4">
        <div className="bg-white rounded-md p-5 shadow-card flex items-center gap-4 animate-fade-in-up">
          <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center text-brand text-xl font-bold shrink-0">
            {(user.name || user.email || "U")[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-[#333333] truncate">
              {user.name || "未设置昵称"}
            </p>
            <p className="text-sm text-[#999999] truncate">{user.email}</p>
          </div>
        </div>

        <div className="bg-white rounded-md shadow-card overflow-hidden animate-fade-in-up stagger-1">
          <button
            onClick={() => router.push("/member")}
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#EEEEEE] card-press"
          >
            <span className="text-sm">会员套餐</span>
            <span className="text-xs text-[#999999]">免费版 →</span>
          </button>
          <button
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#EEEEEE] card-press"
          >
            <span className="text-sm">使用统计</span>
            <span className="text-xs text-[#999999]">0/10 次</span>
          </button>
          <button
            className="w-full px-4 py-3.5 flex items-center justify-between card-press"
          >
            <span className="text-sm">关于票小助</span>
            <span className="text-xs text-[#999999]">v1.0.0</span>
          </button>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full bg-white text-error py-3 rounded-xl text-sm font-medium shadow-card disabled:opacity-50 btn-press animate-fade-in-up stagger-2"
        >
          {loggingOut ? "退出中..." : "退出登录"}
        </button>
      </div>

      <TabBar />
    </div>
  );
}
