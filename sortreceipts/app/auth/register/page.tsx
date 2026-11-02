"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Turnstile from "@/components/turnstile";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";
import { registerUser, sendRegisterCode } from "@/lib/actions/user-actions";

/**
 * 注册页。
 *
 * 账号的成立条件是「邮箱能收信」，不是「填了一个邮箱地址」。所以这里分两步：
 * 先发六位验证码，用户从邮箱读出来填回来，服务端核对通过才建账号。
 *
 * 两次提交都带人机验证的 token。token 只能用一次，所以每用一次就换一张
 * 新的挂件（靠 resetKey 触发重渲染）。
 */

const CODE_COOLDOWN = 60;

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [turnstileToken, setTurnstileToken] = useState("");
  const [widgetKey, setWidgetKey] = useState(0);

  const [errors, setErrors] = useState<{ email?: string; code?: string; password?: string; confirm?: string }>({});

  // 重发倒计时。验证码本身 10 分钟内都能用，这里只是挡住连点
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  function validate(): boolean {
    const errs: { email?: string; code?: string; password?: string; confirm?: string } = {};
    if (!email.trim()) {
      errs.email = t("auth.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = t("auth.emailInvalid");
    }
    if (!/^\d{6}$/.test(code.trim())) {
      errs.code = t("auth.codeRequired");
    }
    if (!password) {
      errs.password = t("auth.passwordRequired");
    } else if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      errs.password = t("auth.passwordRule");
    }
    if (!confirmPassword) {
      errs.confirm = t("auth.confirmRequired");
    } else if (password !== confirmPassword) {
      errs.confirm = t("auth.confirmMismatch");
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSendCode() {
    if (countdown > 0 || sending) return;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors((p) => ({ ...p, email: t("auth.emailInvalid") }));
      return;
    }

    setSending(true);
    const result = await sendRegisterCode(email, turnstileToken);
    setSending(false);
    // 用过的 token 立即失效，换一张新的给下一次用
    setTurnstileToken("");
    setWidgetKey((k) => k + 1);

    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(t("auth.codeSent"), "success");
    setCountdown(CODE_COOLDOWN);
    setErrors((p) => ({ ...p, code: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    const result = await registerUser(email, password, name || email, code.trim());
    setLoading(false);

    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(t("auth.registerSuccess"), "success");
    router.push("/auth/login");
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-8 bg-gradient-to-b from-brand-bg to-white">
      <div className="mx-auto w-full max-w-md">
      <div className="animate-fade-in-up">
        <h1 className="text-3xl font-bold text-brand mb-2">{t("auth.registerTitle")}</h1>
        <p className="text-sm text-[#64748B] mb-8">{t("auth.registerSubtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up stagger-2" noValidate>
        <div>
          <label className="block text-sm text-[#475569] mb-1.5">{t("auth.nickname")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm bg-white focus:border-brand focus:outline-none transition-colors"
            placeholder={t("auth.nicknamePlaceholder")}
          />
        </div>

        <div>
          <label className="block text-sm text-[#475569] mb-1.5">{t("auth.emailLabel")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
            className={`w-full border rounded-xl px-4 py-3 text-sm bg-white focus:outline-none transition-colors ${
              errors.email ? "border-[#DC2626] focus:border-[#DC2626]" : "border-[#E2E8F0] focus:border-brand"
            }`}
            placeholder={t("auth.emailPlaceholder")}
            required
          />
          {errors.email && <p className="text-xs text-[#DC2626] mt-1">{errors.email}</p>}
        </div>

        <div>
          <label className="block text-sm text-[#475569] mb-1.5">{t("auth.emailCodeLabel")}</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                setErrors((p) => ({ ...p, code: undefined }));
              }}
              className={`flex-1 min-w-0 border rounded-xl px-4 py-3 text-sm bg-white focus:outline-none transition-colors tracking-[0.2em] ${
                errors.code ? "border-[#DC2626] focus:border-[#DC2626]" : "border-[#E2E8F0] focus:border-brand"
              }`}
              placeholder={t("auth.emailCodePlaceholder")}
              required
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sending || countdown > 0}
              className="shrink-0 whitespace-nowrap rounded-xl border border-brand/30 px-3 py-3 text-xs font-medium text-brand disabled:opacity-40 btn-press"
            >
              {sending
                ? t("auth.sendingCode")
                : countdown > 0
                  ? `${countdown}s`
                  : t("auth.sendCode")}
            </button>
          </div>
          {errors.code && <p className="text-xs text-[#DC2626] mt-1">{errors.code}</p>}
        </div>

        <div>
          <label className="block text-sm text-[#475569] mb-1.5">{t("auth.passwordLabel")}</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
              className={`w-full border rounded-xl px-4 py-3 pr-11 text-sm bg-white focus:outline-none transition-colors ${
                errors.password ? "border-[#DC2626] focus:border-[#DC2626]" : "border-[#E2E8F0] focus:border-brand"
              }`}
              placeholder={t("auth.passwordMinLength")}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#475569] transition-colors"
              aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
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
          {errors.password && <p className="text-xs text-[#DC2626] mt-1">{errors.password}</p>}
        </div>

        <div>
          <label className="block text-sm text-[#475569] mb-1.5">{t("auth.confirmPasswordLabel")}</label>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }}
              className={`w-full border rounded-xl px-4 py-3 pr-11 text-sm bg-white focus:outline-none transition-colors ${
                errors.confirm ? "border-[#DC2626] focus:border-[#DC2626]" : "border-[#E2E8F0] focus:border-brand"
              }`}
              placeholder={t("auth.confirmPasswordPlaceholder")}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#475569] transition-colors"
              aria-label={showConfirm ? t("auth.hidePassword") : t("auth.showPassword")}
            >
              {showConfirm ? (
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
          {errors.confirm && <p className="text-xs text-[#DC2626] mt-1">{errors.confirm}</p>}
        </div>

        <Turnstile onToken={setTurnstileToken} resetKey={widgetKey} />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white py-3 rounded-xl font-medium disabled:opacity-50 btn-press"
        >
          {loading ? t("auth.registering") : t("auth.register")}
        </button>
      </form>

      <p className="text-center text-sm text-[#64748B] mt-6 animate-fade-in-up stagger-3">
        {t("auth.hasAccount")}
        <button
          onClick={() => router.push("/auth/login")}
          className="text-brand font-medium ml-1 btn-press"
        >
          {t("auth.loginNow")}
        </button>
      </p>
      </div>
    </div>
  );
}
