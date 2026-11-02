"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/actions/auth-actions";
import { updateUserName } from "@/lib/actions/user-actions";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";
import { SHOW_CHECKIN } from "@/lib/region";
import PageHeader from "@/components/page-header";
import TabBar from "@/components/tab-bar";

interface UserInfo {
  name: string | null;
  email: string | null;
  planCode: string;
  quotaUsed: number;
  quotaTotal: number;
}

export default function MineClient({ user: initialUser }: { user: UserInfo }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { locale, setLocale, t } = useI18n();
  const [user, setUser] = useState(initialUser);
  const [loggingOut, setLoggingOut] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(initialUser.name || "");
  const [savingName, setSavingName] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const PLAN_LABELS: Record<string, string> = {
    free: t("member.free"),
    pro: t("member.pro"),
    enterprise: t("member.enterprise"),
  };

  function handleToggleLocale() {
    const next = locale === "zh" ? "en" : "zh";
    setLocale(next);
    showToast(next === "zh" ? "已切换为中文" : "Switched to English", "success");
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      showToast(t("mine.nicknameEmpty"), "error");
      return;
    }
    setSavingName(true);
    try {
      await updateUserName(trimmed);
      setUser((prev) => ({ ...prev, name: trimmed }));
      showToast(t("mine.nicknameUpdated"), "success");
      setEditingName(false);
    } catch {
      showToast(t("common.error"), "error");
    } finally {
      setSavingName(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.push("/auth/login");
      router.refresh();
    } catch {
      showToast(t("common.error"), "error");
      setLoggingOut(false);
    }
  }

  return (
    <div className="pb-16 min-h-screen bg-[#F8FAFC] lg:pb-10">
      <PageHeader title={t("nav.mine")} />

      <div className="px-4 pt-1 space-y-4 lg:mx-auto lg:max-w-2xl lg:px-10 lg:pt-6">
        <div className="bg-white rounded-md p-5 shadow-card flex items-center gap-4 animate-fade-in-up">
          <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center text-brand text-xl font-bold shrink-0">
            {(user.name || user.email || "U")[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  placeholder={t("home.projectName")}
                  maxLength={20}
                  className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="text-sm text-brand btn-press disabled:opacity-50"
                >
                  {savingName ? "..." : t("mine.nicknameSave")}
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="text-sm text-[#64748B] btn-press"
                >
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <div
                onClick={() => {
                  setNameInput(user.name || "");
                  setEditingName(true);
                }}
                className="cursor-pointer"
              >
                <p className="font-medium text-[#0F172A] truncate">
                  {user.name || t("mine.nicknamePlaceholder")}
                  <span className="text-xs text-brand ml-1">{t("mine.editNickname")}</span>
                </p>
              </div>
            )}
            <p className="text-sm text-[#64748B] truncate">{user.email}</p>
          </div>
        </div>

        <div className="bg-white rounded-md shadow-card overflow-hidden animate-fade-in-up stagger-1">
          {/* 积分与签到是高频入口，放在最前面：用户打开「我的」多数是为了看余额 */}
          <button
            onClick={() => router.push("/points")}
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#E2E8F0] card-press"
          >
            <span className="text-sm">{t("points.title")}</span>
            <span className="text-xs text-[#64748B]">{t("mine.view")} →</span>
          </button>
          {/* 签到是国内增长机制，海外版不提供；积分改为随套餐每月发放 */}
          {SHOW_CHECKIN && (
            <button
              onClick={() => router.push("/checkin")}
              className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#E2E8F0] card-press"
            >
              <span className="text-sm">{t("checkin.title")}</span>
              <span className="text-xs text-[#2563EB]">{t("mine.checkinCta")} →</span>
            </button>
          )}
          <button
            onClick={() => router.push("/member")}
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#E2E8F0] card-press"
          >
            <span className="text-sm">{t("mine.plan")}</span>
            <span className="text-xs text-[#64748B]">{PLAN_LABELS[user.planCode] || user.planCode} →</span>
          </button>
          <button
            onClick={() => router.push("/promo")}
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#E2E8F0] card-press"
          >
            <span className="text-sm">{t("mine.recommend")}</span>
            <span className="text-xs text-[#2563EB]">{t("mine.recommendLabel")} →</span>
          </button>
          <button
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#E2E8F0] card-press"
            onClick={() => showToast(`${t("mine.usage")} ${user.quotaUsed}/${user.quotaTotal}`, "info")}
          >
            <span className="text-sm">{t("mine.usage")}</span>
            <span className="text-xs text-[#64748B]">{user.quotaUsed}/{user.quotaTotal}</span>
          </button>
          <button
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#E2E8F0] card-press"
            onClick={handleToggleLocale}
          >
            <span className="text-sm">{t("mine.language")}</span>
            <span className="text-xs text-[#64748B]">{locale === "zh" ? "中文" : "English"} →</span>
          </button>
          <button
            className="w-full px-4 py-3.5 flex items-center justify-between card-press"
            onClick={() => setShowAbout(!showAbout)}
          >
            <span className="text-sm">{t("mine.about")}</span>
            <span className="text-xs text-[#64748B]">v1.0.0</span>
          </button>
        </div>

        {showAbout && (
          <div className="bg-white rounded-md p-5 shadow-card animate-fade-in-up">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🎫</div>
              <h3 className="text-lg font-bold text-[#0F172A]">{t("app.name")}</h3>
              <p className="text-xs text-[#64748B]">v1.0.0</p>
            </div>
            <p className="text-sm text-[#475569] text-center leading-relaxed">
              {t("mine.aboutDesc")}<br />
              {t("mine.aboutFeatures")}
            </p>
            <div className="mt-4 pt-3 border-t border-[#E2E8F0] text-center">
              <p className="text-xs text-[#94A3B8]">{t("mine.aboutContact")}</p>
            </div>
            <button
              onClick={() => setShowAbout(false)}
              className="w-full mt-3 text-sm text-brand btn-press"
            >
              {t("mine.close")}
            </button>
          </div>
        )}

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full bg-white text-error py-3 rounded-xl text-sm font-medium shadow-card disabled:opacity-50 btn-press animate-fade-in-up stagger-2"
        >
          {loggingOut ? t("mine.loggingOut") : t("mine.logoutBtn")}
        </button>
      </div>

      <TabBar />
    </div>
  );
}
