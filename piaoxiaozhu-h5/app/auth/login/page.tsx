"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        showToast("邮箱或密码错误", "error");
      } else {
        showToast("登录成功", "success");
        router.push("/");
        router.refresh();
      }
    } catch {
      showToast("登录失败，请重试", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-8 bg-gradient-to-b from-brand-bg to-white">
      <div className="animate-fade-in-up">
        <h1 className="text-3xl font-bold text-brand mb-2">票小助</h1>
        <p className="text-sm text-[#999999] mb-8">AI驱动的餐饮票据整理工具</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up stagger-2">
        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-[#EEEEEE] rounded-xl px-4 py-3 text-sm bg-white focus:border-brand focus:outline-none"
            placeholder="邮箱"
            required
          />
        </div>
        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-[#EEEEEE] rounded-xl px-4 py-3 text-sm bg-white focus:border-brand focus:outline-none"
            placeholder="密码"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white py-3 rounded-xl font-medium disabled:opacity-50 btn-press"
        >
          {loading ? "登录中..." : "登录"}
        </button>
      </form>

      <p className="text-center text-sm text-[#999999] mt-6 animate-fade-in-up stagger-3">
        还没有账号？
        <button
          onClick={() => router.push("/auth/register")}
          className="text-brand font-medium ml-1 btn-press"
        >
          立即注册
        </button>
      </p>
    </div>
  );
}
