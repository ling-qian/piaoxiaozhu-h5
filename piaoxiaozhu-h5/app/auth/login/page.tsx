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
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate(): boolean {
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errs.email = "请输入邮箱";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "邮箱格式不正确";
    }
    if (!password) {
      errs.password = "请输入密码";
    } else if (password.length < 6) {
      errs.password = "密码至少6位";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

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

      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up stagger-2" noValidate>
        <div>
          <label className="block text-sm text-[#666666] mb-1.5">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
            className={`w-full border rounded-xl px-4 py-3 text-sm bg-white focus:outline-none transition-colors ${
              errors.email ? "border-[#FF4D4F] focus:border-[#FF4D4F]" : "border-[#EEEEEE] focus:border-brand"
            }`}
            placeholder="请输入邮箱"
            required
          />
          {errors.email && (
            <p className="text-xs text-[#FF4D4F] mt-1">{errors.email}</p>
          )}
        </div>
        <div>
          <label className="block text-sm text-[#666666] mb-1.5">密码</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
              className={`w-full border rounded-xl px-4 py-3 pr-11 text-sm bg-white focus:outline-none transition-colors ${
                errors.password ? "border-[#FF4D4F] focus:border-[#FF4D4F]" : "border-[#EEEEEE] focus:border-brand"
              }`}
              placeholder="请输入密码"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999999] hover:text-[#666666] transition-colors"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-[#FF4D4F] mt-1">{errors.password}</p>
          )}
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