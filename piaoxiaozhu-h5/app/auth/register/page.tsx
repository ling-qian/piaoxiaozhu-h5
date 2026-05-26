"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { registerUser } from "@/lib/actions/user-actions";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("两次密码不一致");
      return;
    }
    if (password.length < 6) {
      setError("密码至少6位");
      return;
    }

    setLoading(true);
    try {
      await registerUser(email, password, name);
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.ok) {
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand to-brand-light flex flex-col items-center justify-center px-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">票小助</h1>
        <p className="text-white/80 text-sm">创建新账号</p>
      </div>

      <div className="w-full bg-white rounded-lg p-6 shadow-card">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-error text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-[#666666] mb-1">昵称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              placeholder="请输入昵称"
              required
            />
          </div>

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
              placeholder="至少6位"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#666666] mb-1">确认密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              placeholder="再次输入密码"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-white py-2.5 rounded-xl font-medium disabled:opacity-50"
          >
            {loading ? "注册中..." : "注册"}
          </button>
        </form>

        <p className="text-center text-sm text-[#999999] mt-4">
          已有账号？{" "}
          <Link href="/auth/login" className="text-brand">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
