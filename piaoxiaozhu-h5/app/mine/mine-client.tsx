"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { updateUserName } from "@/lib/actions/user-actions";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";
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
      await signOut({ callbackUrl: "/auth/login" });
    } catch {
      showToast(t("common.error"), "error");
      setLoggingOut(false);
    }
  }

  return (
    <div className="pb-16 min-h-screen bg-[#F5F5F5]">
      <PageHeader title={t("nav.mine")} />

      <div className="px-4 pt-1 space-y-4">
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
                  className="flex-1 border border-[#EEEEEE] rounded-lg px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
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
                  className="text-sm text-[#999999] btn-press"
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
                <p className="font-medium text-[#333333] truncate">
                  {user.name || t("mine.nicknamePlaceholder")}
                  <span className="text-xs text-brand ml-1">{t("mine.editNickname")}</span>
                </p>
              </div>
            )}
            <p className="text-sm text-[#999999] truncate">{user.email}</p>
          </div>
        </div>

        <div className="bg-white rounded-md shadow-card overflow-hidden animate-fade-in-up stagger-1">
          <button
            onClick={() => router.push("/member")}
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#EEEEEE] card-press"
          >
            <span className="text-sm">{t("mine.plan")}</span>
            <span className="text-xs text-[#999999]">{PLAN_LABELS[user.planCode] || user.planCode} →</span>
          </button>
          <button
            onClick={() => router.push("/promo")}
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#EEEEEE] card-press"
          >
            <span className="text-sm">{t("mine.recommend")}</span>
            <span className="text-xs text-[#FF6B35]">{t("mine.recommendLabel")} →</span>
          </button>
          <button
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#EEEEEE] card-press"
            onClick={() => showToast(`${t("mine.usage")} ${user.quotaUsed}/${user.quotaTotal}`, "info")}
          >
            <span className="text-sm">{t("mine.usage")}</span>
            <span className="text-xs text-[#999999]">{user.quotaUsed}/{user.quotaTotal}</span>
          </button>
          <button
            className="w-full px-4 py-3.5 flex items-center justify-between border-b border-[#EEEEEE] card-press"
            onClick={handleToggleLocale}
          >
            <span className="text-sm">{t("mine.language")}</span>
            <span className="text-xs text-[#999999]">{locale === "zh" ? "中文" : "English"} →</span>
          </button>
          <button
            className="w-full px-4 py-3.5 flex items-center justify-between card-press"
            onClick={() => setShowAbout(!showAbout)}
          >
            <span className="text-sm">{t("mine.about")}</span>
            <span className="text-xs text-[#999999]">v1.0.0</span>
          </button>
        </div>

        {showAbout && (
          <div className="bg-white rounded-md p-5 shadow-card animate-fade-in-up">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🎫</div>
              <h3 className="text-lg font-bold text-[#333333]">{t("app.name")}</h3>
              <p className="text-xs text-[#999999]">v1.0.0</p>
            </div>
            <p className="text-sm text-[#666666] text-center leading-relaxed">
              {t("mine.aboutDesc")}<br />
              {t("mine.aboutFeatures")}
            </p>
            <div className="mt-4 pt-3 border-t border-[#EEEEEE] text-center">
              <p className="text-xs text-[#BBBBBB]">{t("mine.aboutContact")}</p>
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
