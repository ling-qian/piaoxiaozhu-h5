"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createProject, deleteProject } from "@/lib/actions/project-actions";
import { useToast } from "@/components/toast";
import PageHeader from "@/components/page-header";
import TabBar from "@/components/tab-bar";

const INDUSTRIES = [
  { value: "restaurant", label: "餐饮" },
  { value: "retail", label: "零售" },
  { value: "service", label: "服务业" },
  { value: "other", label: "其他" },
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
      showToast("项目已删除", "success");
    } catch {
      showToast("删除失败", "error");
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
      showToast("项目创建成功", "success");
      router.push(`/project/${project.id}`);
    } catch {
      showToast("创建失败，请重试", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="pb-16 min-h-screen bg-[#F5F5F5]">
      <PageHeader title="票小助" />

      <div className="px-4 -mt-4 space-y-3">
        {!isLoggedIn ? (
          /* 未登录：品牌介绍 + 登录引导 */
          <div className="space-y-4 animate-fade-in-up">
            <div className="bg-white rounded-md p-6 shadow-card text-center">
              <div className="text-5xl mb-3">🎫</div>
              <h2 className="text-xl font-bold text-[#333333] mb-2">票小助</h2>
              <p className="text-sm text-[#999999] mb-1">餐饮票据智能整理助手</p>
              <p className="text-xs text-[#BBBBBB]">拍照识别 · 自动分类 · 报表统计</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: "📸", label: "拍照识别" },
                { icon: "🏷️", label: "智能分类" },
                { icon: "📊", label: "报表统计" },
              ].map((f) => (
                <div key={f.label} className="bg-white rounded-md p-3 shadow-card text-center">
                  <div className="text-2xl mb-1">{f.icon}</div>
                  <div className="text-xs text-[#666666]">{f.label}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push("/auth/login")}
              className="w-full bg-brand text-white py-3 rounded-xl text-sm font-medium btn-press"
            >
              登录 / 注册
            </button>
          </div>
        ) : (
          <>
            {/* 快捷操作 */}
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
                <div className="text-3xl mb-1">📷</div>
                <div className="text-sm font-medium">拍照识别</div>
                <div className="text-xs opacity-80 mt-0.5">上传票据自动识别</div>
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
                <div className="text-3xl mb-1">✏️</div>
                <div className="text-sm font-medium">手动录入</div>
                <div className="text-xs opacity-70 mt-0.5">手动填写票据信息</div>
              </button>
            </div>

            <div className="flex items-center justify-between animate-fade-in">
              <h2 className="text-base font-semibold text-[#333333]">我的项目</h2>
              <button
                onClick={() => setShowCreate(true)}
                className="bg-brand text-white text-sm px-4 py-1.5 rounded-xl btn-press"
              >
                + 新建
              </button>
            </div>

            {projectList.length === 0 ? (
              <div className="bg-white rounded-md p-8 shadow-card text-center animate-fade-in-up">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-sm text-[#999999]">暂无项目，点击上方新建</p>
              </div>
            ) : (
              <div className="space-y-2">
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
                      <span className="font-medium text-[#333333]">{p.name}</span>
                      <span className="text-xs text-[#999999]">
                        {p._count.records} 条记录
                      </span>
                    </div>
                    <p className="text-xs text-[#999999] mt-1">
                      {INDUSTRIES.find((ind) => ind.value === p.industry)?.label || p.industry} · {new Date(p.createdAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center animate-fade-in">
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-mobile animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">新建项目</h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none mb-3"
              placeholder="项目名称"
              autoFocus
            />
            <div className="mb-4">
              <label className="block text-xs text-[#999999] mb-2">行业类型</label>
              <div className="flex gap-2 flex-wrap">
                {INDUSTRIES.map((ind) => (
                  <button
                    key={ind.value}
                    onClick={() => setNewIndustry(ind.value)}
                    className={`px-4 py-2 rounded-xl text-sm btn-press ${
                      newIndustry === ind.value
                        ? "bg-brand text-white"
                        : "bg-[#F5F5F5] text-[#666666]"
                    }`}
                  >
                    {ind.label}
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
                className="flex-1 border border-[#EEEEEE] py-2.5 rounded-xl text-sm btn-press"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm disabled:opacity-50 btn-press"
              >
                {creating ? "创建中..." : "确定"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center animate-fade-in" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-2xl p-6 w-[280px] animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-center mb-2">删除项目</h3>
            <p className="text-sm text-[#999999] text-center mb-5">确定删除该项目及其所有记录？此操作不可撤销。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 border border-[#EEEEEE] py-2.5 rounded-xl text-sm btn-press"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteProject(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                className="flex-1 bg-[#FF4D4F] text-white py-2.5 rounded-xl text-sm disabled:opacity-50 btn-press"
              >
                {deletingId === confirmDeleteId ? "删除中..." : "删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      <TabBar />
    </div>
  );
}
