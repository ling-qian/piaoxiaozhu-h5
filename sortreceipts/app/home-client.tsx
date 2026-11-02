"use client";

import { NUMBER_LOCALE } from "@/lib/currency";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createProject, deleteProject } from "@/lib/actions/project-actions";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";
import PageHeader from "@/components/page-header";
import TabBar from "@/components/tab-bar";
import DashboardCard from "@/components/dashboard-card";
import AppShell from "@/components/app-shell";

const INDUSTRIES = [
  { value: "restaurant", labelKey: "industry.restaurant" },
  { value: "retail", labelKey: "industry.retail" },
  { value: "service", labelKey: "industry.service" },
  { value: "other", labelKey: "industry.other" },
];

interface Project {
  id: string;
  name: string;
  industry: string;
  createdAt: Date;
  _count: { records: number };
}

export default function HomeClient({ projects, isLoggedIn }: { projects: Project[]; isLoggedIn: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIndustry, setNewIndustry] = useState("restaurant");
  const [creating, setCreating] = useState(false);
  const [projectList, setProjectList] = useState(projects);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pressingId, setPressingId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLongPressStart = useCallback((id: string) => {
    setPressingId(id);
    longPressTimer.current = setTimeout(() => {
      setConfirmDeleteId(id);
      setPressingId(null);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    setPressingId(null);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  async function handleDeleteProject(id: string) {
    setDeletingId(id);
    try {
      await deleteProject(id);
      setProjectList((prev) => prev.filter((p) => p.id !== id));
      setConfirmDeleteId(null);
      showToast(t("common.deleted"), "success");
    } catch {
      showToast(t("common.deleteFail"), "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const project = await createProject(newName.trim(), newIndustry);
      setShowCreate(false);
      setNewName("");
      setNewIndustry("restaurant");
      showToast(t("common.created"), "success");
      router.push(`/project/${project.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.createFail");
      showToast(message, "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell force>
    <div className="pb-16 min-h-screen bg-[#F8FAFC] lg:pb-0">
      <PageHeader
        title={t("app.name")}
        desktopTitle={t("nav.home")}
        desktopSubtitle={t("home.subtitle")}
        showLogo
        showDesktopDate
      />

      <div className="px-4 pt-1 space-y-3 lg:grid lg:grid-cols-[1fr_1.6fr] lg:items-start lg:gap-6 lg:space-y-0 lg:px-10 lg:pt-6">
        {!isLoggedIn ? (
          <div className="space-y-4 animate-fade-in-up">
            <div className="bg-white rounded-md p-6 shadow-card text-center">
              <div className="text-5xl mb-3">🎫</div>
              <h2 className="text-xl font-bold text-[#0F172A] mb-2">{t("app.name")}</h2>
              <p className="text-sm text-[#64748B] mb-1">{t("home.brandSlogan")}</p>
              <p className="text-xs text-[#94A3B8]">{t("home.brandFeatures")}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: "📸", labelKey: "home.featureScan" },
                { icon: "🏷️", labelKey: "home.featureClassify" },
                { icon: "📊", labelKey: "home.featureReport" },
              ].map((f) => (
                <div key={f.labelKey} className="bg-white rounded-md p-3 shadow-card text-center">
                  <div className="text-2xl mb-1">{f.icon}</div>
                  <div className="text-xs text-[#475569]">{t(f.labelKey)}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push("/auth/login")}
              className="w-full bg-brand text-white py-3 rounded-xl text-sm font-medium btn-press"
            >
              {t("auth.loginBtn")}
            </button>
          </div>
        ) : (
          <>
            {/* 手机：保留原来的 2×2 大图标入口 */}
            <div className="space-y-3 lg:hidden">
            <div className="grid grid-cols-2 gap-3 animate-fade-in-up">
              <button
                onClick={async () => {
                  if (projectList.length > 0) {
                    router.push(`/upload?project=${projectList[0].id}`);
                  } else {
                    setShowCreate(true);
                  }
                }}
                className="bg-brand text-white rounded-xl p-4 text-center btn-press shadow-card"
              >
                <span className="mx-auto mb-1 grid h-9 w-9 place-items-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
                <div className="text-sm font-medium">{t("home.photoScan")}</div>
                <div className="text-xs opacity-80 mt-0.5">{t("home.photoScanDesc")}</div>
              </button>
              <button
                onClick={async () => {
                  if (projectList.length > 0) {
                    router.push(`/result?project=${projectList[0].id}&manual=1`);
                  } else {
                    setShowCreate(true);
                  }
                }}
                className="bg-white border border-brand text-brand rounded-xl p-4 text-center btn-press shadow-card"
              >
                <span className="mx-auto mb-1 grid h-9 w-9 place-items-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </span>
                <div className="text-sm font-medium">{t("home.manualEntry")}</div>
                <div className="text-xs opacity-70 mt-0.5">{t("home.manualEntryDesc")}</div>
              </button>
            </div>

            {/* 与小程序首页对齐的两个入口：AI 记账和问账都在这一屏能点到 */}
            <div className="grid grid-cols-2 gap-3 animate-fade-in-up">
              <button
                onClick={() => router.push("/quick-entry")}
                className="bg-white rounded-xl p-4 text-center btn-press shadow-card"
              >
                <span className="mx-auto mb-1 grid h-9 w-9 place-items-center text-brand">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <div className="text-sm font-medium text-[#0F172A]">{t("home.sayEntry")}</div>
                <div className="text-xs text-[#64748B] mt-0.5">{t("home.sayEntryDesc")}</div>
              </button>
              <button
                onClick={() => router.push("/ask")}
                className="bg-white rounded-xl p-4 text-center btn-press shadow-card"
              >
                <span className="mx-auto mb-1 grid h-9 w-9 place-items-center text-brand">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                    <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5 10.1 12 4.5 10l5.6-1.4z" />
                  </svg>
                </span>
                <div className="text-sm font-medium text-[#0F172A]">{t("home.ask")}</div>
                <div className="text-xs text-[#64748B] mt-0.5">{t("home.askDesc")}</div>
              </button>
            </div>
            </div>

            {/* 桌面：四个入口一行排开。首张卡加宽并加重底色，是这一屏的主操作 */}
            <div className="hidden lg:col-span-2 lg:grid lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-4">
              <DesktopAction
                primary
                label={t("home.photoScan")}
                desc={t("home.photoScanDesc")}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                }
                onClick={() => {
                  if (projectList.length > 0) {
                    router.push(`/upload?project=${projectList[0].id}`);
                  } else {
                    setShowCreate(true);
                  }
                }}
              />
              <DesktopAction
                label={t("home.manualEntry")}
                desc={t("home.manualEntryDesc")}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                }
                onClick={() => {
                  if (projectList.length > 0) {
                    router.push(`/result?project=${projectList[0].id}&manual=1`);
                  } else {
                    setShowCreate(true);
                  }
                }}
              />
              <DesktopAction
                label={t("home.sayEntry")}
                desc={t("home.sayEntryDesc")}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                }
                onClick={() => router.push("/quick-entry")}
              />
              <DesktopAction
                label={t("home.ask")}
                desc={t("home.askDesc")}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5 10.1 12 4.5 10l5.6-1.4z" />
                  </svg>
                }
                onClick={() => router.push("/ask")}
              />
            </div>

            {/* 本月概览：手机在入口下方，桌面在左栏 */}
            <div className="space-y-3 lg:col-span-1">
            <DashboardCard />
            </div>

            {/* 桌面端右栏：项目列表 */}
            <div className="space-y-3 lg:col-span-1">
            <div className="flex items-center justify-between animate-fade-in">
              <h2 className="text-lg font-semibold text-[#0F172A]">{t("home.title")}</h2>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 rounded-sm bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dark btn-press"
              >
                + {t("home.newProject")}
              </button>
            </div>

            {projectList.length === 0 ? (
              <div className="bg-white rounded-md p-8 shadow-card text-center animate-fade-in-up lg:flex lg:min-h-[220px] lg:flex-col lg:items-center lg:justify-center lg:gap-4 lg:rounded-lg lg:border lg:border-dashed lg:border-[#CBD5E1] lg:p-14 lg:shadow-none">
                <p className="text-4xl mb-3 lg:hidden">📋</p>
                <span className="hidden lg:grid h-14 w-14 place-items-center rounded-md bg-[#F1F5F9] text-[#94A3B8]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </span>
                <p className="text-sm text-[#64748B]">{t("home.noProject")}</p>
              </div>
            ) : (
              <>
              {/* 手机：卡片列表，长按删除 */}
              <div className="space-y-2 lg:hidden">
                {projectList.map((p, i) => (
                  <div
                    key={p.id}
                    className={`bg-white rounded-md p-4 shadow-card cursor-pointer card-press animate-fade-in-up stagger-${Math.min(i + 1, 6)} transition-all duration-150 ${
                      pressingId === p.id ? "scale-95 bg-gray-50" : ""
                    }`}
                    onClick={() => {
                      if (!confirmDeleteId) router.push(`/project/${p.id}`);
                    }}
                    onTouchStart={() => handleLongPressStart(p.id)}
                    onTouchEnd={handleLongPressEnd}
                    onTouchCancel={handleLongPressEnd}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setConfirmDeleteId(p.id);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#0F172A]">{p.name}</span>
                      <span className="text-xs text-[#64748B]">
                        {p._count.records} {t("home.records")}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] mt-1">
                      {INDUSTRIES.find((ind) => ind.value === p.industry) ? t(INDUSTRIES.find((ind) => ind.value === p.industry)!.labelKey) : p.industry} · <span suppressHydrationWarning>{new Date(p.createdAt).toLocaleDateString(NUMBER_LOCALE)}</span>
                    </p>
                  </div>
                ))}
              </div>

              {/* 桌面：表格。行高更紧凑，一屏能看更多项目 */}
              <div className="hidden overflow-hidden rounded-xl border border-[#E2E8F0] bg-white lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#64748B]">
                      <th className="px-5 py-3 text-left font-medium">{t("home.projectName")}</th>
                      <th className="px-5 py-3 text-left font-medium">{t("home.industryType")}</th>
                      <th className="px-5 py-3 text-right font-medium">{t("home.recordsLabel")}</th>
                      <th className="px-5 py-3 text-right font-medium">{t("home.created")}</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {projectList.map((p) => {
                      const ind = INDUSTRIES.find((i) => i.value === p.industry);
                      return (
                        <tr
                          key={p.id}
                          onClick={() => router.push(`/project/${p.id}`)}
                          className="cursor-pointer border-b border-[#F1F5F9] transition-colors last:border-0 hover:bg-[#F8FAFC]"
                        >
                          <td className="px-5 py-3 font-medium text-[#0F172A]">{p.name}</td>
                          <td className="px-5 py-3 text-[#475569]">{ind ? t(ind.labelKey) : p.industry}</td>
                          <td className="px-5 py-3 text-right text-[#475569]">{p._count.records}</td>
                          <td className="px-5 py-3 text-right text-[#64748B]" suppressHydrationWarning>
                            {new Date(p.createdAt).toLocaleDateString(NUMBER_LOCALE)}
                          </td>
                          <td className="pr-4 text-right text-[#CBD5E1]">→</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center animate-fade-in">
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-mobile animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">{t("home.newProjectTitle")}</h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none mb-3"
              placeholder={t("home.projectName")}
              autoFocus
            />
            <div className="mb-4">
              <label className="block text-xs text-[#64748B] mb-2">{t("home.industryType")}</label>
              <div className="flex gap-2 flex-wrap">
                {INDUSTRIES.map((ind) => (
                  <button
                    key={ind.value}
                    onClick={() => setNewIndustry(ind.value)}
                    className={`px-4 py-2 rounded-xl text-sm btn-press ${
                      newIndustry === ind.value
                        ? "bg-brand text-white"
                        : "bg-[#F8FAFC] text-[#475569]"
                    }`}
                  >
                    {t(ind.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewName("");
                  setNewIndustry("restaurant");
                }}
                className="flex-1 border border-[#E2E8F0] py-2.5 rounded-xl text-sm btn-press"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm disabled:opacity-50 btn-press"
              >
                {creating ? t("common.loading") : t("home.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center animate-fade-in" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-2xl p-6 w-[280px] animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-center mb-2">{t("project.deleteTitle")}</h3>
            <p className="text-sm text-[#64748B] text-center mb-5">{t("project.deleteConfirm")}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 border border-[#E2E8F0] py-2.5 rounded-xl text-sm btn-press"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleDeleteProject(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                className="flex-1 bg-[#DC2626] text-white py-2.5 rounded-xl text-sm disabled:opacity-50 btn-press"
              >
                {deletingId === confirmDeleteId ? t("common.loading") : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      <TabBar />
    </div>
    </AppShell>
  );
}

/**
 * 桌面端入口卡片。
 *
 * 和手机端的大图标方块不同：桌面横向空间多，一张卡占行内一段，
 * 图标在上、文字在下。第一张卡加宽并用渐变底，是这一屏的主操作。
 */
function DesktopAction({
  icon,
  label,
  desc,
  onClick,
  primary = false,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-6 text-left transition-all ${
        primary
          ? "border-transparent bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-white hover:shadow-[0_8px_24px_rgba(37,99,235,0.25)]"
          : "border-[#E2E8F0] bg-white hover:-translate-y-px hover:border-[#CBD5E1] hover:shadow-card"
      }`}
    >
      <span
        className={`mb-4 grid h-11 w-11 place-items-center rounded-md ${
          primary ? "bg-white/20 text-white" : "bg-[#F1F5F9] text-brand"
        }`}
      >
        {icon}
      </span>
      <span className={`block text-base font-semibold ${primary ? "text-white" : "text-[#0F172A]"}`}>{label}</span>
      <span className={`mt-1 block text-[13px] leading-relaxed ${primary ? "text-white/75" : "text-[#64748B]"}`}>
        {desc}
      </span>
    </button>
  );
}
