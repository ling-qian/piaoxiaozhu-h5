"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stat-card";
import RecordCard from "@/components/record-card";
import TabBar from "@/components/tab-bar";
import { formatAmount } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import { deleteRecord, getRecords } from "@/lib/actions/record-actions";
import { deleteProject } from "@/lib/actions/project-actions";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";
import { RecordItem } from "@/types/record";
import CategoryTag from "@/components/category-tag";
import FilterBar from "./filter-bar";
import SearchBar from "./search-bar";
import IncomeModal from "./income-modal";
import ProjectMenuModal from "./project-menu-modal";

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
  const { t } = useI18n();
  const [records, setRecords] = useState(initialRecords);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDirection, setFilterDirection] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
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

  const hasActiveFilter = Boolean(filterCategory || filterDirection || filterDateFrom || filterDateTo || searchQuery);

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
      showToast(t("common.loadFail"), "error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDeleteRecord(recordId: string) {
    setDeletingId(recordId);
    try {
      await deleteRecord(recordId);
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
      showToast(t("common.recordDeleted"), "success");
    } catch {
      showToast(t("common.deleteFail"), "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteProject() {
    await deleteProject(projectId);
    showToast(t("common.deleted"), "success");
    router.push("/");
    router.refresh();
  }

  return (
    <div className="pb-16 min-h-screen bg-[#F5F5F5]">
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

      <div className="px-4 pt-1 space-y-4">
        {/* 统计卡片 */}
        <StatRow stats={stats} t={t} />

        {/* 成本分类可视化 */}
        {stats.costByCategory && stats.costByCategory.length > 0 && (
          <CostCategoryChart categories={stats.costByCategory} t={t} />
        )}

        {/* 操作按钮 */}
        <ActionButtons
          projectId={projectId}
          onAddIncome={() => setShowIncomeModal(true)}
          t={t}
        />

        {/* AI 经营分析入口 */}
        <AnalysisEntry projectId={projectId} t={t} />

        {/* 记录头部 — 计数 + 多选/筛选/报表 */}
        <RecordHeader
          count={filteredRecords.length}
          total={records.length}
          selectMode={selectMode}
          hasActiveFilter={hasActiveFilter}
          onToggleSelect={() => {
            setSelectMode(!selectMode);
            setSelectedIds(new Set());
          }}
          onToggleFilter={() => setShowFilterBar(!showFilterBar)}
          onViewReport={() => router.push(`/report/${projectId}`)}
          t={t}
        />

        {/* 批量操作栏 */}
        {selectMode && (
          <BatchActionBar
            filteredCount={filteredRecords.length}
            selectedCount={selectedIds.size}
            batchDeleting={batchDeleting}
            onToggleSelectAll={() => {
              const allIds = new Set(filteredRecords.map((r) => r.id));
              setSelectedIds(selectedIds.size === filteredRecords.length ? new Set() : allIds);
            }}
            onDeleteSelected={async () => {
              setBatchDeleting(true);
              try {
                for (const id of selectedIds) {
                  await deleteRecord(id);
                }
                setRecords((prev) => prev.filter((r) => !selectedIds.has(r.id)));
                setSelectedIds(new Set());
                setSelectMode(false);
                showToast(`${t("common.deleted")} ${selectedIds.size} ${t("report.records")}`, "success");
                router.refresh();
              } catch {
                showToast(t("common.deleteFail"), "error");
              } finally {
                setBatchDeleting(false);
              }
            }}
            t={t}
          />
        )}

        {/* 搜索栏 */}
        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        {/* 分类筛选条 */}
        <FilterBar
          showFilterBar={showFilterBar}
          hasActiveFilter={hasActiveFilter}
          filterCategory={filterCategory}
          filterDirection={filterDirection}
          filterDateFrom={filterDateFrom}
          filterDateTo={filterDateTo}
          onToggle={() => setShowFilterBar(!showFilterBar)}
          onSetCategory={setFilterCategory}
          onSetDirection={setFilterDirection}
          onSetDateFrom={setFilterDateFrom}
          onSetDateTo={setFilterDateTo}
          onClearFilters={clearAllFilters}
        />

        {/* 记录列表 */}
        {filteredRecords.length === 0 && records.length > 0 ? (
          <EmptyFiltered onClear={clearAllFilters} t={t} />
        ) : records.length === 0 ? (
          <EmptyRecords t={t} />
        ) : (
          <RecordList
            records={filteredRecords}
            swipedId={swipedId}
            selectedIds={selectedIds}
            deletingId={deletingId}
            selectMode={selectMode}
            projectId={projectId}
            onSwipeStart={handleTouchStart}
            onSwipeEnd={handleTouchEnd}
            onSelect={(id) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onDelete={handleDeleteRecord}
            onLoadMore={handleLoadMore}
            nextCursor={nextCursor}
            loadingMore={loadingMore}
            t={t}
          />
        )}
      </div>

      {/* 弹窗 */}
      {showProjectMenu && (
        <ProjectMenuModal
          projectName={stats.projectName}
          projectId={projectId}
          confirmDelete={confirmDelete}
          onConfirmDelete={() => setConfirmDelete(true)}
          onCancelDelete={() => setConfirmDelete(false)}
          onClose={() => setShowProjectMenu(false)}
          onDeleteProject={handleDeleteProject}
          onViewReport={() => {
            setShowProjectMenu(false);
            router.push(`/report/${projectId}`);
          }}
          showToast={showToast}
        />
      )}

      {showIncomeModal && (
        <IncomeModal
          projectId={projectId}
          onClosed={() => setShowIncomeModal(false)}
          onSuccess={() => {
            setShowIncomeModal(false);
            router.refresh();
          }}
          showToast={showToast}
        />
      )}

      <TabBar projectId={projectId} />
    </div>
  );
}

/** 统计卡片行 */
function StatRow({ stats, t }: { stats: Stats; t: (key: string) => string }) {
  return (
    <div className="flex gap-2">
      <StatCard label={t("project.totalIncome")} value={`¥${formatAmount(stats.totalIncome)}`} color="#52C41A" />
      <StatCard label={t("project.totalExpense")} value={`¥${formatAmount(stats.totalExpense)}`} color="#FF4D4F" />
      <StatCard
        label={t("project.grossProfit")}
        value={`¥${formatAmount(stats.grossProfit)}`}
        color={stats.grossProfit >= 0 ? "#52C41A" : "#FF4D4F"}
      />
    </div>
  );
}

/** 成本分类可视化 */
function CostCategoryChart({ categories, t }: { categories: { code: string; name: string; amount: number }[]; t: (key: string) => string }) {
  const maxAmount = categories[0]?.amount || 1;
  return (
    <div className="bg-white rounded-md p-3 shadow-card animate-fade-in-up stagger-1">
      <h3 className="text-sm font-semibold text-[#333333] mb-2">{t("project.costCategory")}</h3>
      <div className="space-y-2">
        {categories.map((cat) => {
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
  );
}

/** 上传/添加收入按钮 */
function ActionButtons({ projectId, onAddIncome, t }: { projectId: string; onAddIncome: () => void; t: (key: string) => string }) {
  const router = useRouter();
  return (
    <div className="flex gap-2 animate-fade-in-up stagger-2">
      <button
        onClick={() => router.push(`/upload?project=${projectId}`)}
        className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-medium btn-press"
      >
        {t("project.photoUpload")}
      </button>
      <button
        onClick={onAddIncome}
        className="flex-1 bg-[#52C41A] text-white py-2.5 rounded-xl text-sm font-medium btn-press"
      >
        {t("project.addIncome")}
      </button>
    </div>
  );
}

/** AI 经营分析入口 */
function AnalysisEntry({ projectId, t }: { projectId: string; t: (key: string) => string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/analysis?project=${projectId}`)}
      className="w-full bg-gradient-to-r from-brand to-[#FF8C42] text-white rounded-xl p-3.5 text-left btn-press shadow-card animate-fade-in-up"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-base">🤖</span>
            <span className="text-sm font-semibold">{t("project.aiAnalysis")}</span>
          </div>
          <p className="text-xs opacity-80 mt-0.5">{t("project.aiAnalysisDesc")}</p>
        </div>
        <span className="text-lg">→</span>
      </div>
    </button>
  );
}

/** 记录头部 — 计数 + 多选/筛选/报表 */
function RecordHeader({
  count,
  total,
  selectMode,
  hasActiveFilter,
  onToggleSelect,
  onToggleFilter,
  onViewReport,
  t,
}: {
  count: number;
  total: number;
  selectMode: boolean;
  hasActiveFilter: boolean;
  onToggleSelect: () => void;
  onToggleFilter: () => void;
  onViewReport: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex items-center justify-between animate-fade-in-up stagger-3">
      <h3 className="text-sm font-semibold text-[#333333]">
        {t("project.records")} ({count}{count < total ? `/${total}` : ""})
      </h3>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSelect}
          className={`text-xs px-2 py-1 rounded-full btn-press ${selectMode ? "bg-brand text-white" : "text-brand"}`}
        >
          {selectMode ? t("common.cancel") : t("project.multiSelect")}
        </button>
        <button
          onClick={onToggleFilter}
          className={`text-xs px-2 py-1 rounded-full btn-press ${hasActiveFilter ? "bg-brand text-white" : "text-brand"}`}
        >
          {t("common.filter")}
        </button>
        <button
          onClick={onViewReport}
          className="text-xs text-brand btn-press"
        >
          {t("project.reportLink")}
        </button>
      </div>
    </div>
  );
}

/** 批量操作栏 */
function BatchActionBar({
  filteredCount,
  selectedCount,
  batchDeleting,
  onToggleSelectAll,
  onDeleteSelected,
  t,
}: {
  filteredCount: number;
  selectedCount: number;
  batchDeleting: boolean;
  onToggleSelectAll: () => void;
  onDeleteSelected: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex items-center gap-2 animate-fade-in-up">
      <button
        onClick={onToggleSelectAll}
        className="text-xs text-brand btn-press"
      >
        {selectedCount === filteredCount ? t("project.cancelSelectAll") : t("project.selectAll")}
      </button>
      <span className="text-xs text-[#999999]">{t("project.selected")} {selectedCount}</span>
      {selectedCount > 0 && (
        <button
          onClick={onDeleteSelected}
          disabled={batchDeleting}
          className="ml-auto text-xs bg-[#FF4D4F] text-white px-3 py-1 rounded-full btn-press disabled:opacity-50"
        >
          {batchDeleting ? t("project.deleting") : `${t("common.delete")} (${selectedCount})`}
        </button>
      )}
    </div>
  );
}

/** 无匹配记录提示 */
function EmptyFiltered({ onClear, t }: { onClear: () => void; t: (key: string) => string }) {
  return (
    <div className="bg-white rounded-md p-6 shadow-card text-center animate-fade-in-up">
      <p className="text-sm text-[#999999]">{t("project.noMatch")}</p>
      <button
        onClick={onClear}
        className="text-xs text-brand mt-2 btn-press"
      >
        {t("project.clearFilter")}
      </button>
    </div>
  );
}

/** 空记录提示 */
function EmptyRecords({ t }: { t: (key: string) => string }) {
  return (
    <div className="bg-white rounded-md p-8 shadow-card text-center animate-fade-in-up">
      <p className="text-4xl mb-3">📝</p>
      <p className="text-sm text-[#999999]">{t("project.noRecords")}</p>
    </div>
  );
}

/** 可滑动的记录列表 */
function RecordList({
  records,
  swipedId,
  selectedIds,
  deletingId,
  selectMode,
  projectId,
  onSwipeStart,
  onSwipeEnd,
  onSelect,
  onDelete,
  onLoadMore,
  nextCursor,
  loadingMore,
  t,
}: {
  records: Record[];
  swipedId: string | null;
  selectedIds: Set<string>;
  deletingId: string | null;
  selectMode: boolean;
  projectId: string;
  onSwipeStart: (id: string, e: React.TouchEvent) => void;
  onSwipeEnd: (e: React.TouchEvent) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
  nextCursor: string | null;
  loadingMore: boolean;
  t: (key: string) => string;
}) {
  const router = useRouter();
  return (
    <div className="space-y-2">
      {records.map((r, i) => {
        const isOpen = swipedId === r.id;
        const isSelected = selectedIds.has(r.id);
        return (
          <div
            key={r.id}
            className={`stagger-${Math.min(i + 1, 6)} relative overflow-hidden`}
            onClick={() => {
              if (selectMode) {
                onSelect(r.id);
              } else if (swipedId) {
                // handled by individual row click
              }
            }}
            onTouchStart={(e) => { if (!selectMode) onSwipeStart(r.id, e); }}
            onTouchEnd={(e) => { if (!selectMode) onSwipeEnd(e); }}
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
                  onDelete(r.id);
                }}
                disabled={deletingId === r.id}
                className="w-[72px] shrink-0 bg-[#FF4D4F] text-white text-xs flex items-center justify-center"
              >
                {deletingId === r.id ? "..." : t("common.delete")}
              </button>
            </div>
          </div>
        );
      })}

      {nextCursor && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full bg-white text-[#666666] py-3 rounded-xl text-sm shadow-card btn-press disabled:opacity-50"
        >
          {loadingMore ? t("common.loading") : t("project.loadMore")}
        </button>
      )}
    </div>
  );
}
