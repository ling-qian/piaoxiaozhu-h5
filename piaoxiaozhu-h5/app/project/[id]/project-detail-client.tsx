"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stat-card";
import RecordCard from "@/components/record-card";
import TabBar from "@/components/tab-bar";
import { formatAmount } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import { deleteRecord, getRecords, addManualIncome } from "@/lib/actions/record-actions";
import { deleteProject } from "@/lib/actions/project-actions";
import { useToast } from "@/components/toast";
import { RecordItem } from "@/types/record";
import CategoryTag from "@/components/category-tag";

interface Stats {
  projectName: string;
  recordCount: number;
  totalIncome: number;
  totalExpense: number;
  grossProfit: number;
  costByCategory: { code: string; name: string; amount: number }[];
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
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterDirection, setFilterDirection] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [incomeMonth, setIncomeMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [incomeAmount, setIncomeAmount] = useState("");
  const [submittingIncome, setSubmittingIncome] = useState(false);
  const touchStartX = useRef(0);
  const touchCurrentId = useRef<string | null>(null);

  // 搜索和筛选
  const filteredRecords = records.filter((r) => {
    if (filterCategory && r.categoryCode !== filterCategory) return false;
    if (filterDirection && r.direction !== filterDirection) return false;
    if (filterDateFrom && r.invoiceDate && r.invoiceDate < filterDateFrom) return false;
    if (filterDateTo && r.invoiceDate && r.invoiceDate > filterDateTo + "9999") return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchMerchant = r.merchantName?.toLowerCase().includes(q);
      const matchAmount = r.amount.toString().includes(q);
      const matchDate = r.invoiceDate?.includes(q);
      const matchCat = CATEGORIES.find((c) => c.code === r.categoryCode)?.name.includes(q);
      const matchRawText = r.rawText?.toLowerCase().includes(q);
      if (!matchMerchant && !matchAmount && !matchDate && !matchCat && !matchRawText) return false;
    }
    return true;
  });

  const hasActiveFilter = filterCategory || filterDirection || filterDateFrom || filterDateTo || searchQuery;

  function clearAllFilters() {
    setSearchQuery("");
    setFilterCategory("");
    setFilterDirection("");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

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

        {/* 成本分类可视化 */}
        {stats.costByCategory && stats.costByCategory.length > 0 && (
          <div className="bg-white rounded-md p-3 shadow-card animate-fade-in-up stagger-1">
            <h3 className="text-sm font-semibold text-[#333333] mb-2">成本分类</h3>
            <div className="space-y-2">
              {stats.costByCategory.map((cat) => {
                const maxAmount = stats.costByCategory[0]?.amount || 1;
                const percent = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
                const catInfo = CATEGORIES.find((c) => c.code === cat.code);
                const barColor = catInfo?.color || "#999999";
                return (
                  <div key={cat.code}>
                    <div className="flex items-center justify-between mb-0.5">
                      <CategoryTag code={cat.code} name={cat.name} />
                      <span className="text-xs font-medium text-[#333333]">
                        ¥{formatAmount(cat.amount)}
                      </span>
                    </div>
                    <div className="h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2 animate-fade-in-up stagger-2">
          <button
            onClick={() => router.push(`/upload?project=${projectId}`)}
            className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-medium btn-press"
          >
            📷 拍照上传
          </button>
          <button
            onClick={() => setShowIncomeModal(true)}
            className="flex-1 bg-[#52C41A] text-white py-2.5 rounded-xl text-sm font-medium btn-press"
          >
            💰 添加收入
          </button>
        </div>

        {/* AI 经营分析入口 */}
        <button
          onClick={() => router.push(`/analysis?project=${projectId}`)}
          className="w-full bg-gradient-to-r from-brand to-[#FF8C42] text-white rounded-xl p-3.5 text-left btn-press shadow-card animate-fade-in-up"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base">🤖</span>
                <span className="text-sm font-semibold">AI 经营分析</span>
              </div>
              <p className="text-xs opacity-80 mt-0.5">利润分析 · 成本优化 · 经营建议</p>
            </div>
            <span className="text-lg">→</span>
          </div>
        </button>

        <div className="flex items-center justify-between animate-fade-in-up stagger-3">
          <h3 className="text-sm font-semibold text-[#333333]">
            记录 ({filteredRecords.length}{filteredRecords.length < records.length ? `/${records.length}` : ""})
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectMode(!selectMode);
                setSelectedIds(new Set());
              }}
              className={`text-xs px-2 py-1 rounded-full btn-press ${selectMode ? "bg-brand text-white" : "text-brand"}`}
            >
              {selectMode ? "取消" : "多选"}
            </button>
            <button
              onClick={() => setShowFilterBar(!showFilterBar)}
              className={`text-xs px-2 py-1 rounded-full btn-press ${hasActiveFilter ? "bg-brand text-white" : "text-brand"}`}
            >
              筛选
            </button>
            <button
              onClick={() => router.push(`/report/${projectId}`)}
              className="text-xs text-brand btn-press"
            >
              报表 →
            </button>
          </div>
        </div>

        {/* 批量操作栏 */}
        {selectMode && (
          <div className="flex items-center gap-2 animate-fade-in-up">
            <button
              onClick={() => {
                const allIds = new Set(filteredRecords.map((r) => r.id));
                setSelectedIds(selectedIds.size === filteredRecords.length ? new Set() : allIds);
              }}
              className="text-xs text-brand btn-press"
            >
              {selectedIds.size === filteredRecords.length ? "取消全选" : "全选"}
            </button>
            <span className="text-xs text-[#999999]">已选 {selectedIds.size} 条</span>
            {selectedIds.size > 0 && (
              <button
                onClick={async () => {
                  setBatchDeleting(true);
                  try {
                    for (const id of selectedIds) {
                      await deleteRecord(id);
                    }
                    setRecords((prev) => prev.filter((r) => !selectedIds.has(r.id)));
                    setSelectedIds(new Set());
                    setSelectMode(false);
                    showToast(`已删除 ${selectedIds.size} 条记录`, "success");
                    router.refresh();
                  } catch {
                    showToast("批量删除失败", "error");
                  } finally {
                    setBatchDeleting(false);
                  }
                }}
                disabled={batchDeleting}
                className="ml-auto text-xs bg-[#FF4D4F] text-white px-3 py-1 rounded-full btn-press disabled:opacity-50"
              >
                {batchDeleting ? "删除中..." : `删除 (${selectedIds.size})`}
              </button>
            )}
          </div>
        )}

        {/* 搜索栏 */}
        <div className="animate-fade-in-up">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索商户、金额、日期..."
              className="w-full bg-white border border-[#EEEEEE] rounded-lg px-3 py-2 pl-8 text-sm focus:border-brand focus:outline-none"
            />
            <svg className="absolute left-2.5 top-2.5 text-[#BBBBBB]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-[#999999] text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 分类筛选条 */}
        {showFilterBar && (
          <div className="bg-white rounded-md p-3 shadow-card space-y-2 animate-fade-in-up">
            {/* 方向筛选 */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilterDirection("")}
                className={`px-2.5 py-1 rounded-full text-xs btn-press ${!filterDirection ? "bg-[#333333] text-white" : "bg-gray-100 text-[#666666]"}`}
              >
                全部方向
              </button>
              <button
                onClick={() => setFilterDirection(filterDirection === "out" ? "" : "out")}
                className={`px-2.5 py-1 rounded-full text-xs btn-press ${filterDirection === "out" ? "bg-[#FF4D4F] text-white" : "bg-gray-100 text-[#666666]"}`}
              >
                支出
              </button>
              <button
                onClick={() => setFilterDirection(filterDirection === "income" ? "" : "income")}
                className={`px-2.5 py-1 rounded-full text-xs btn-press ${filterDirection === "income" ? "bg-[#52C41A] text-white" : "bg-gray-100 text-[#666666]"}`}
              >
                收入
              </button>
            </div>
            {/* 分类筛选 */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilterCategory("")}
                className={`px-2.5 py-1 rounded-full text-xs btn-press ${!filterCategory ? "bg-[#333333] text-white" : "bg-gray-100 text-[#666666]"}`}
              >
                全部分类
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.code}
                  onClick={() => setFilterCategory(filterCategory === cat.code ? "" : cat.code)}
                  className={`px-2.5 py-1 rounded-full text-xs btn-press ${filterCategory === cat.code ? "text-white" : "bg-gray-100 text-[#666666]"}`}
                  style={filterCategory === cat.code ? { backgroundColor: cat.color } : undefined}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            {/* 日期范围 */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="flex-1 border border-[#EEEEEE] rounded-lg px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
                placeholder="开始日期"
              />
              <span className="text-xs text-[#999999]">至</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="flex-1 border border-[#EEEEEE] rounded-lg px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
                placeholder="结束日期"
              />
            </div>
            {hasActiveFilter && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-brand btn-press"
              >
                清除所有筛选
              </button>
            )}
          </div>
        )}

        {filteredRecords.length === 0 && records.length > 0 ? (
          <div className="bg-white rounded-md p-6 shadow-card text-center animate-fade-in-up">
            <p className="text-sm text-[#999999]">没有匹配的记录</p>
            <button
              onClick={clearAllFilters}
              className="text-xs text-brand mt-2 btn-press"
            >
              清除筛选
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-md p-8 shadow-card text-center animate-fade-in-up">
            <p className="text-4xl mb-3">📝</p>
            <p className="text-sm text-[#999999]">暂无记录，开始上传票据吧</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRecords.map((r, i) => {
              const isOpen = swipedId === r.id;
              const isSelected = selectedIds.has(r.id);
              return (
                <div
                  key={r.id}
                  className={`stagger-${Math.min(i + 1, 6)} relative overflow-hidden`}
                  onClick={() => {
                    if (selectMode) {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      });
                    } else if (swipedId) {
                      setSwipedId(null);
                    }
                  }}
                  onTouchStart={(e) => { if (!selectMode) handleTouchStart(r.id, e); }}
                  onTouchEnd={(e) => { if (!selectMode) handleTouchEnd(e); }}
                >
                  <div
                    className="flex transition-transform duration-200 ease-out"
                    style={{ transform: isOpen && !selectMode ? "translateX(-72px)" : undefined }}
                  >
                    {selectMode && (
                      <div className="flex items-center pr-2 shrink-0">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? "bg-brand border-brand" : "border-[#CCCCCC]"
                          }`}
                        >
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </div>
                    )}
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

      {/* 添加收入弹窗 */}
      {showIncomeModal && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center animate-fade-in"
          onClick={() => setShowIncomeModal(false)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-mobile animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">添加收入</h3>
            <div className="mb-3">
              <label className="block text-xs text-[#999999] mb-1.5">月份</label>
              <input
                type="month"
                value={incomeMonth}
                onChange={(e) => setIncomeMonth(e.target.value)}
                className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-[#999999] mb-1.5">金额（元）</label>
              <input
                type="number"
                inputMode="decimal"
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
                placeholder="请输入收入金额"
                className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowIncomeModal(false);
                  setIncomeAmount("");
                }}
                className="flex-1 border border-[#EEEEEE] py-2.5 rounded-xl text-sm btn-press"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const amount = parseFloat(incomeAmount);
                  if (!incomeAmount || isNaN(amount) || amount <= 0) {
                    showToast("请输入有效金额", "error");
                    return;
                  }
                  setSubmittingIncome(true);
                  try {
                    await addManualIncome(projectId, incomeMonth, amount);
                    showToast("收入添加成功", "success");
                    setShowIncomeModal(false);
                    setIncomeAmount("");
                    router.refresh();
                  } catch {
                    showToast("添加失败", "error");
                  } finally {
                    setSubmittingIncome(false);
                  }
                }}
                disabled={submittingIncome}
                className="flex-1 bg-[#52C41A] text-white py-2.5 rounded-xl text-sm disabled:opacity-50 btn-press"
              >
                {submittingIncome ? "提交中..." : "确定"}
              </button>
            </div>
          </div>
        </div>
      )}

      <TabBar projectId={projectId} />
    </div>
  );
}
