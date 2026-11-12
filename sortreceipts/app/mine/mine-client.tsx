"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/actions/auth-actions";
import { getInboxAddress, sendDigestTest, testInboundReceipt, updateUserName } from "@/lib/actions/user-actions";
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

/** FileReader 版本的 base64，图片无法用 canvas 解码时兜底 */
function readBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * 上传前先压到长边 1200。两个原因：Server Action 的请求体有 1MB 上限，
 * 而手机原图动辄 4–8MB；识别本身也只用到这个分辨率，传大图是白花流量。
 */
async function compactImage(file: File): Promise<{ dataBase64: string; contentType: string; filename: string }> {
  if (!file.type.startsWith("image/")) {
    return { dataBase64: await readBase64(file), contentType: file.type || "image/jpeg", filename: file.name };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.8, 0.6, 0.45]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) continue;
      const dataBase64 = await readBase64(blob);
      // 900KB 的 base64 留足余量，避免撞上 Server Action 的 1MB 限制
      if (dataBase64.length < 900_000) {
        return { dataBase64, contentType: "image/jpeg", filename: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
      }
    }
  } catch {
    // HEIC 在部分浏览器解不了，退回原图
  }

  return { dataBase64: await readBase64(file), contentType: file.type || "image/jpeg", filename: file.name };
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
  const [inbox, setInbox] = useState<{ address: string; configured: boolean } | null>(null);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [testingReceipt, setTestingReceipt] = useState(false);

  useEffect(() => {
    getInboxAddress()
      .then(setInbox)
      .catch(() => {});
  }, []);

  async function handleCopyInbox() {
    if (!inbox) return;
    try {
      await navigator.clipboard.writeText(inbox.address);
      showToast(t("mine.inboxCopied"), "success");
    } catch {
      // 剪贴板权限被拒时把地址亮出来，让用户手动选中
      showToast(inbox.address, "info");
    }
  }

  async function handleDigestTest() {
    if (sendingDigest) return;
    setSendingDigest(true);
    try {
      const r = await sendDigestTest();
      showToast(r.ok ? t("mine.inboxDigestSent") : r.error, r.ok ? "success" : "error");
    } finally {
      setSendingDigest(false);
    }
  }

  async function handleReceiptFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTestingReceipt(true);
    try {
      const compacted = await compactImage(file);
      const r = await testInboundReceipt(compacted);
      showToast(r.ok ? t("mine.inboxTestOk") : (r.error ?? t("common.error")), r.ok ? "success" : "error");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("common.error"), "error");
    } finally {
      setTestingReceipt(false);
      e.target.value = "";
    }
  }

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

        <div className="bg-white rounded-md p-5 shadow-card animate-fade-in-up stagger-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[#0F172A]">{t("mine.inboxTitle")}</p>
            <button
              onClick={handleCopyInbox}
              disabled={!inbox}
              className="text-xs text-brand btn-press disabled:opacity-40"
            >
              {t("mine.inboxCopy")}
            </button>
          </div>

          <p className="mt-2 text-sm text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 font-mono break-all">
            {inbox?.address ?? "—"}
          </p>
          <p className="mt-2 text-xs text-[#64748B] leading-relaxed">{t("mine.inboxDesc")}</p>
          <p className="mt-1 text-xs text-[#94A3B8] leading-relaxed">{t("mine.inboxHint")}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={handleDigestTest}
              disabled={sendingDigest}
              className="text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[#475569] btn-press disabled:opacity-50"
            >
              {t("mine.inboxDigest")}
            </button>
            <label className="text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[#475569] btn-press cursor-pointer">
              {testingReceipt ? t("mine.inboxTesting") : t("mine.inboxUpload")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                disabled={testingReceipt}
                onChange={handleReceiptFile}
              />
            </label>
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
