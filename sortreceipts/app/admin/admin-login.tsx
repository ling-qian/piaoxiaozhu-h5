"use client";

import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";

import PageHeader from "@/components/page-header";

/**
 * 管理员令牌入口。
 *
 * 令牌通过 POST 交给服务端校验并存进 httpOnly cookie，前端不留副本。
 * 校验失败会显示 Worker 返回的具体原因（未启用 / 令牌无效），
 * 而不是笼统的「登录失败」——后台进不去时需要马上知道该改哪个配置。
 */
export default function AdminLogin() {
  const { t } = useI18n();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim() || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || t("admin.tokenFailed"));
        return;
      }
      // 服务端已写入 cookie，刷新让 page.tsx 重新判断登录态
      router.refresh();
    } catch {
      setError(t("admin.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader title={t("admin.title")} showBack />

      <form onSubmit={handleSubmit} className="px-4 pt-8">
        <div className="bg-white rounded-xl p-5 shadow-card">
          <label className="block">
            <span className="text-sm text-[#475569]">{t("admin.tokenLabel")}</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="X-Admin-Token"
              autoComplete="off"
              className="w-full mt-2 rounded-lg bg-[#F8FAFC] px-3 py-2.5 text-sm outline-none"
            />
          </label>

          {error && <p className="text-xs text-[#DC2626] mt-2">{error}</p>}

          <button
            type="submit"
            disabled={loading || !token.trim()}
            className={`w-full mt-4 py-2.5 rounded-lg text-sm font-medium text-white ${
              loading || !token.trim() ? "bg-[#D9D9D9]" : "bg-[#2563EB] active:opacity-80"
            }`}
          >
            {loading ? t("admin.verifying") : t("admin.enter")}
          </button>

          <p className="text-[11px] text-[#64748B] mt-3 leading-relaxed">
            {t("admin.tokenHint")}
          </p>
        </div>
      </form>
    </div>
  );
}
