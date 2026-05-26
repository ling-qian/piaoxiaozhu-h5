"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("邮箱或密码错误");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("登录失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand to-brand-light flex flex-col items-center justify-center px-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">票小助</h1>
        <p className="text-white/80 text-sm">餐饮票据整理助手</p>
      </div>

      <div className="w-full bg-white rounded-lg p-6 shadow-card">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-error text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-[#666666] mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              placeholder="请输入邮箱"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#666666] mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              placeholder="请输入密码"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-white py-2.5 rounded-xl font-medium disabled:opacity-50"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        <p className="text-center text-sm text-[#999999] mt-4">
          还没有账号？{" "}
          <Link href="/auth/register" className="text-brand">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  );
}
