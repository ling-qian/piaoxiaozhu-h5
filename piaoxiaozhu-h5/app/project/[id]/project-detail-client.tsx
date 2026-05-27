"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stat-card";
import RecordCard from "@/components/record-card";
import TabBar from "@/components/tab-bar";
import { formatAmount } from "@/lib/utils";
import { deleteRecord, getRecords } from "@/lib/actions/record-actions";
import { deleteProject } from "@/lib/actions/project-actions";
import { useToast } from "@/components/toast";
import { RecordItem } from "@/types/record";

interface Stats {
  projectName: string;
  recordCount: number;
  totalIncome: number;
  totalExpense: number;
  grossProfit: number;
}

type Record = RecordItem;

export default function ProjectDetailClient({
  projectId,
  stats,
  initialRecords,
  initialNextCursor,
}: {
  projectId: string;
  stats: Stats;
  initialRecords: Record[];
  initialNextCursor: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [records, setRecords] = useState(initialRecords);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const touchStartX = useRef(0);
  const touchCurrentId = useRef<string | null>(null);

  const handleTouchStart = useCallback((recordId: string, e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentId.current = recordId;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const id = touchCurrentId.current;
    if (!id) return;
    if (deltaX < -40) {
      setSwipedId(id);
    } else if (deltaX > 40) {
      setSwipedId(null);
    }
    touchCurrentId.current = null;
  }, []);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await getRecords(projectId, nextCursor);
      setRecords((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch {
      showToast("加载失败", "error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDeleteRecord(recordId: string) {
    setDeletingId(recordId);
    try {
      await deleteRecord(recordId);
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
      showToast("记录已删除", "success");
    } catch {
      showToast("删除失败", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteProject() {
    try {
      await deleteProject(projectId);
      showToast("项目已删除", "success");
      router.push("/");
      router.refresh();
    } catch {
      showToast("删除失败", "error");
      setConfirmDelete(false);
    }
  }

  return (
    <div className="pb-16">
      <PageHeader
        title={stats.projectName}
        showBack
        onBack={() => router.push("/")}
        rightAction={
          <button
            onClick={() => setShowProjectMenu(true)}
            className="text-[#666666] p-1"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <circle cx="10" cy="4" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="10" cy="16" r="1.5" />
            </svg>
          </button>
        }
      />

      <div className="px-4 -mt-4 space-y-4">
        <div className="flex gap-2">
          <StatCard label="总收入" value={`¥${formatAmount(stats.totalIncome)}`} color="#52C41A" />
          <StatCard label="总支出" value={`¥${formatAmount(stats.totalExpense)}`} color="#FF4D4F" />
          <StatCard
            label="毛利润"
            value={`¥${formatAmount(stats.grossProfit)}`}
            color={stats.grossProfit >= 0 ? "#52C41A" : "#FF4D4F"}
          />
        </div>

        <div className="flex gap-2 animate-fade-in-up stagger-2">
          <button
            onClick={() => router.push(`/upload?project=${projectId}`)}
            className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-medium btn-press"
          >
            📷 拍照上传
          </button>
          <button
            onClick={() => router.push(`/result?project=${projectId}&manual=1`)}
            className="flex-1 bg-white text-brand border border-brand py-2.5 rounded-xl text-sm font-medium btn-press"
          >
            ✏️ 手动录入
          </button>
        </div>

        <div className="flex items-center justify-between animate-fade-in-up stagger-3">
          <h3 className="text-sm font-semibold text-[#333333]">
            记录 ({records.length})
          </h3>
          <button
            onClick={() => router.push(`/report/${projectId}`)}
            className="text-xs text-brand btn-press"
          >
            查看报表 →
          </button>
        </div>

        {records.length === 0 ? (
          <div className="bg-white rounded-md p-8 shadow-card text-center animate-fade-in-up">
            <p className="text-4xl mb-3">📝</p>
            <p className="text-sm text-[#999999]">暂无记录，开始上传票据吧</p>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((r, i) => {
              const isOpen = swipedId === r.id;
              return (
                <div
                  key={r.id}
                  className={`stagger-${Math.min(i + 1, 6)} relative overflow-hidden`}
                  onClick={() => { if (swipedId) setSwipedId(null); }}
                  onTouchStart={(e) => handleTouchStart(r.id, e)}
                  onTouchEnd={handleTouchEnd}
                >
                  <div
                    className="flex transition-transform duration-200 ease-out sm:translate-x-[-72px]"
                    style={{ transform: isOpen ? "translateX(-72px)" : undefined }}
                  >
                    <div
                      className="flex-1 min-w-0"
                      onClick={() => { if (!isOpen) router.push(`/result?recordId=${r.id}&project=${projectId}`); }}
                    >
                      <RecordCard {...r} />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRecord(r.id);
                      }}
                      disabled={deletingId === r.id}
                      className="w-[72px] shrink-0 bg-[#FF4D4F] text-white text-xs flex items-center justify-center"
                    >
                      {deletingId === r.id ? "..." : "删除"}
                    </button>
                  </div>
                </div>
              );
            })}

            {nextCursor && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full bg-white text-[#666666] py-3 rounded-xl text-sm shadow-card btn-press disabled:opacity-50"
              >
                {loadingMore ? "加载中..." : "加载更多"}
              </button>
            )}
          </div>
        )}
      </div>

      {showProjectMenu && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center animate-fade-in"
          onClick={() => {
            setShowProjectMenu(false);
            setConfirmDelete(false);
          }}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-mobile animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">项目操作</h3>

            {!confirmDelete ? (
              <div className="space-y-2">
                <button
                  onClick={() => router.push(`/report/${projectId}`)}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#F5F5F5] text-sm"
                >
                  📊 查看报表
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#FFF2F0] text-sm text-[#FF4D4F]"
                >
                  🗑️ 删除项目
                </button>
                <button
                  onClick={() => setShowProjectMenu(false)}
                  className="w-full text-center px-4 py-3 rounded-xl border border-[#EEEEEE] text-sm"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#666666]">
                  确定删除项目 <strong>{stats.projectName}</strong>？所有记录将被永久删除，此操作不可撤销。
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 border border-[#EEEEEE] py-2.5 rounded-xl text-sm btn-press"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleDeleteProject}
                    className="flex-1 bg-[#FF4D4F] text-white py-2.5 rounded-xl text-sm btn-press"
                  >
                    确认删除
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <TabBar projectId={projectId} />
    </div>
  );
}
