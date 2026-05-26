"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/actions/user-actions";
import { useToast } from "@/components/toast";

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast("两次密码不一致", "error");
      return;
    }
    if (password.length < 6) {
      showToast("密码至少6位", "error");
      return;
    }

    setLoading(true);
    try {
      await registerUser(email, password, name || email);
      showToast("注册成功，请登录", "success");
      router.push("/auth/login");
    } catch (err: any) {
      showToast(err.message || "注册失败", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-8 bg-gradient-to-b from-brand-bg to-white">
      <div className="animate-fade-in-up">
        <h1 className="text-3xl font-bold text-brand mb-2">注册账号</h1>
        <p className="text-sm text-[#999999] mb-8">创建票小助账号，开始整理票据</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up stagger-2">
        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-[#EEEEEE] rounded-xl px-4 py-3 text-sm bg-white focus:border-brand focus:outline-none"
            placeholder="昵称 (可选)"
          />
        </div>
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
            placeholder="密码 (至少6位)"
            required
          />
        </div>
        <div>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border border-[#EEEEEE] rounded-xl px-4 py-3 text-sm bg-white focus:border-brand focus:outline-none"
            placeholder="确认密码"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white py-3 rounded-xl font-medium disabled:opacity-50 btn-press"
        >
          {loading ? "注册中..." : "注册"}
        </button>
      </form>

      <p className="text-center text-sm text-[#999999] mt-6 animate-fade-in-up stagger-3">
        已有账号？
        <button
          onClick={() => router.push("/auth/login")}
          className="text-brand font-medium ml-1 btn-press"
        >
          立即登录
        </button>
      </p>
    </div>
  );
}
