"use client";

import { currencySymbolOf, formatMoney, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stat-card";
import RecordCard from "@/components/record-card";
import TabBar from "@/components/tab-bar";
import { formatAmount } from "@/lib/utils";
import { CATEGORIES, categoryLabel } from "@/lib/constants";
import { deleteRecord, getRecords } from "@/lib/actions/record-actions";
import { deleteProject, updateProjectCurrency } from "@/lib/actions/project-actions";
import type { Finding, ProjectFindings } from "@/lib/actions/project-actions";
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
  currency,
  stats,
  initialRecords,
  initialNextCursor,
  findings,
}: {
  projectId: string;
  /** 项目记账币种，金额显示按它走 */
  currency: string;
  stats: Stats;
  initialRecords: Record[];
  initialNextCursor: string | null;
  /** 本月异常，取不到时为 null，整张卡不显示 */
  findings: ProjectFindings | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { t } = useI18n();
  // 币种可以改：老项目建的时候还没这个字段，一律是 USD。
  // 改的是显示口径，已经存下的金额不换算。
  const [currencyCode, setCurrencyCode] = useState(currency);

  async function handleCurrencyChange(code: string) {
    if (code === currencyCode) return;
    setCurrencyCode(code);
    try {
      await updateProjectCurrency(projectId, code);
      showToast(t("common.saved"), "success");
      router.refresh();
    } catch {
      setCurrencyCode(currency);
      showToast(t("common.saveFail"), "error");
    }
  }
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
      // 按当前语言下的分类名匹配。用中文名匹配的话，英文用户搜 "Rent" 永远搜不到
        const matchCat = categoryLabel(r.categoryCode, t).toLowerCase().includes(q.toLowerCase());
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
    <div className="pb-16 min-h-screen bg-[#F8FAFC] lg:pb-10">
      <PageHeader
        title={stats.projectName}
        showBack
        onBack={() => router.push("/")}
        rightAction={
          <button
            onClick={() => setShowProjectMenu(true)}
            className="text-[#475569] p-1"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <circle cx="10" cy="4" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="10" cy="16" r="1.5" />
            </svg>
          </button>
        }
      />

      <div className="px-4 pt-1 space-y-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-5 lg:space-y-0 lg:px-10 lg:pt-6">
        {/* 左栏：统计、成本分布、操作入口。手机上按顺序从上往下排 */}
        <div className="space-y-4 lg:col-span-1">
        {/* 统计卡片 */}
        <StatRow stats={stats} t={t} currency={currencyCode} />

        {/* 记账币种：改的是显示口径，已存金额不换算 */}
        <div className="bg-white rounded-md p-3 shadow-card">
          <label className="block text-xs text-[#64748B] mb-2">{t("home.currency")}</label>
          <select
            value={currencyCode}
            onChange={(e) => handleCurrencyChange(e.target.value)}
            className="w-full border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-sm bg-white focus:border-brand focus:outline-none"
          >
            {SUPPORTED_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code} {currencySymbolOf(code)}
              </option>
            ))}
          </select>
        </div>

        {/* 成本分类可视化 */}
        {stats.costByCategory && stats.costByCategory.length > 0 && (
          <CostCategoryChart categories={stats.costByCategory} t={t} currency={currencyCode} />
        )}

        {/* 操作按钮 */}
        <ActionButtons
          projectId={projectId}
          onAddIncome={() => setShowIncomeModal(true)}
          t={t}
        />
        </div>

        {/* 右栏：记录列表与筛选 */}
        <div className="space-y-4 lg:col-span-2">
        {/* 本月发现：异常从交付包里提出来，每次打开项目都能看见 */}
        {findings && (
          <FindingsCard
            findings={findings}
            currency={currencyCode}
            projectId={projectId}
            t={t}
          />
        )}

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

        {/* 记录列表：手机用卡片（可左滑删除），桌面用表格 */}
        {filteredRecords.length === 0 && records.length > 0 ? (
          <EmptyFiltered onClear={clearAllFilters} t={t} />
        ) : records.length === 0 ? (
          <EmptyRecords t={t} />
        ) : (
          <>
          <div className="lg:hidden">
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
              currency={currencyCode}
              t={t}
            />
          </div>
          <RecordTable
            records={filteredRecords}
            projectId={projectId}
            deletingId={deletingId}
            onDelete={handleDeleteRecord}
            onLoadMore={handleLoadMore}
            nextCursor={nextCursor}
            loadingMore={loadingMore}
            currency={currencyCode}
            t={t}
          />
          </>
        )}
        </div>
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

/** 统计卡片行：手机横排三个，桌面左栏里改成竖排 */
function StatRow({ stats, t, currency }: { stats: Stats; t: (key: string) => string; currency: string }) {
  const symbol = currencySymbolOf(currency);
  return (
    <div className="flex gap-2 lg:flex-col">
      <StatCard label={t("project.totalIncome")} value={`${symbol}${formatAmount(stats.totalIncome)}`} color="#059669" />
      <StatCard label={t("project.totalExpense")} value={`${symbol}${formatAmount(stats.totalExpense)}`} color="#DC2626" />
      <StatCard
        label={t("project.grossProfit")}
        value={`${symbol}${formatAmount(stats.grossProfit)}`}
        color={stats.grossProfit >= 0 ? "#059669" : "#DC2626"}
      />
    </div>
  );
}

/** 成本分类可视化 */
function CostCategoryChart({ categories, t, currency }: { categories: { code: string; name: string; amount: number }[]; t: (key: string) => string; currency: string }) {
  const symbol = currencySymbolOf(currency);
  const maxAmount = categories[0]?.amount || 1;
  return (
    <div className="bg-white rounded-md p-3 shadow-card animate-fade-in-up stagger-1">
      <h3 className="text-sm font-semibold text-[#0F172A] mb-2">{t("project.costCategory")}</h3>
      <div className="space-y-2">
        {categories.map((cat) => {
          const percent = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
          const catInfo = CATEGORIES.find((c) => c.code === cat.code);
          const barColor = catInfo?.color || "#64748B";
          return (
            <div key={cat.code}>
              <div className="flex items-center justify-between mb-0.5">
                <CategoryTag code={cat.code} />
                <span className="text-xs font-medium text-[#0F172A]">
                  {symbol}{formatAmount(cat.amount)}
                </span>
              </div>
              <div className="h-2 bg-[#F8FAFC] rounded-full overflow-hidden">
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
        className="flex-1 bg-[#059669] text-white py-2.5 rounded-xl text-sm font-medium btn-press"
      >
        {t("project.addIncome")}
      </button>
    </div>
  );
}

/** 本月发现：把交付包里的异常清单提到项目页，每月的重复、缺票、金额异常都在这里 */
function FindingsCard({
  findings,
  currency,
  projectId,
  t,
}: {
  findings: ProjectFindings;
  currency: string;
  projectId: string;
  t: (key: string) => string;
}) {
  const router = useRouter();
  const rows = findings.findings;
  const hasRecords = findings.recordCount > 0;

  return (
    <div className="bg-white rounded-md p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-[#0F172A]">{t("findings.title")}</h3>
          <span className="text-xs text-[#94A3B8]">{findings.month}</span>
        </div>
        <button
          onClick={() => router.push(`/pack?project=${projectId}&month=${findings.month}`)}
          className="text-xs text-brand shrink-0 btn-press"
        >
          {t("findings.openPack")} →
        </button>
      </div>

      {!hasRecords ? (
        <p className="text-xs text-[#64748B] mt-2 leading-relaxed">{t("findings.noRecords")}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-[#64748B] mt-2 leading-relaxed">{t("findings.empty")}</p>
      ) : (
        <ul className="mt-2.5 space-y-2.5">
          {rows.map((f, i) => (
            <li key={`${f.code}-${i}`} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${severityDot(f.severity)}`} />
                  <span className="text-sm text-[#0F172A]">{findingLabel(f, t)}</span>
                </div>
                {f.code === "amount_outlier" && f.label && (
                  <p className="text-xs text-[#94A3B8] mt-0.5 pl-3">
                    {categoryLabel(f.label, t)} · {f.ratio}×
                  </p>
                )}
                {f.code === "duplicate_invoice_no" && f.label && (
                  <p className="text-xs text-[#94A3B8] mt-0.5 pl-3 truncate">{f.label}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-[#0F172A]">{formatMoney(f.amount, currency)}</p>
                <p className="text-xs text-[#94A3B8]">
                  {f.count}
                  {t("findings.unit")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasRecords && rows.length > 0 && (
        <p className="text-[11px] text-[#94A3B8] mt-3 leading-relaxed">{t("findings.footnote")}</p>
      )}
    </div>
  );
}

function severityDot(severity: Finding["severity"]): string {
  if (severity === "high") return "bg-[#DC2626]";
  if (severity === "medium") return "bg-[#D97706]";
  return "bg-[#94A3B8]";
}

function findingLabel(f: Finding, t: (key: string) => string): string {
  if (f.code === "duplicate_invoice_no") return t("findings.duplicate");
  if (f.code === "missing_invoice") return t("findings.missingInvoice");
  if (f.code === "amount_outlier") return t("findings.outlier");
  return t("findings.missingDate");
}

/** AI 经营分析入口 */
function AnalysisEntry({ projectId, t }: { projectId: string; t: (key: string) => string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/analysis?project=${projectId}`)}
      className="w-full bg-gradient-to-r from-brand to-[#7C3AED] text-white rounded-xl p-3.5 text-left btn-press shadow-card animate-fade-in-up"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5 10.1 12 4.5 10l5.6-1.4z" />
            </svg>
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
      <h3 className="text-sm font-semibold text-[#0F172A]">
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
      <span className="text-xs text-[#64748B]">{t("project.selected")} {selectedCount}</span>
      {selectedCount > 0 && (
        <button
          onClick={onDeleteSelected}
          disabled={batchDeleting}
          className="ml-auto text-xs bg-[#DC2626] text-white px-3 py-1 rounded-full btn-press disabled:opacity-50"
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
      <p className="text-sm text-[#64748B]">{t("project.noMatch")}</p>
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
      <p className="text-sm text-[#64748B]">{t("project.noRecords")}</p>
    </div>
  );
}

/** 桌面端记录表格：一屏能看十几条，比放大的手机卡片更合适 */
function RecordTable({
  records,
  projectId,
  deletingId,
  onDelete,
  onLoadMore,
  nextCursor,
  loadingMore,
  currency,
  t,
}: {
  records: Record[];
  projectId: string;
  deletingId: string | null;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
  nextCursor: string | null;
  loadingMore: boolean;
  currency: string;
  t: (key: string) => string;
}) {
  const router = useRouter();
  const symbol = currencySymbolOf(currency);
  return (
    <div className="hidden lg:block">
      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs text-[#64748B]">
              <th className="px-5 py-3 text-left font-medium">{t("project.date")}</th>
              <th className="px-5 py-3 text-left font-medium">{t("project.merchant")}</th>
              <th className="px-5 py-3 text-left font-medium">{t("project.category")}</th>
              <th className="px-5 py-3 text-right font-medium">{t("project.amount")}</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const cat = CATEGORIES.find((c) => c.code === r.categoryCode);
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/result?recordId=${r.id}&project=${projectId}`)}
                  className="group cursor-pointer border-b border-[#F1F5F9] transition-colors last:border-0 hover:bg-[#F8FAFC]"
                >
                  <td className="whitespace-nowrap px-5 py-3 text-[#475569]">{r.invoiceDate || "-"}</td>
                  <td className="max-w-[280px] truncate px-5 py-3 font-medium text-[#0F172A]">
                    {r.merchantName || "-"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#475569]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: cat?.color || "#64748B" }}
                      />
                      {categoryLabel(r.categoryCode, t)}
                    </span>
                  </td>
                  <td
                    className={`whitespace-nowrap px-5 py-3 text-right font-medium ${
                      r.direction === "income" ? "text-[#059669]" : "text-[#DC2626]"
                    }`}
                  >
                    {r.direction === "income" ? "+" : "-"}
                    {symbol}
                    {formatAmount(r.amount)}
                  </td>
                  <td className="w-12 pr-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(r.id);
                      }}
                      disabled={deletingId === r.id}
                      aria-label={t("common.delete")}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#CBD5E1] transition-colors hover:bg-[#FFF1F0] hover:text-[#DC2626] disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-3 w-full rounded-xl border border-[#E2E8F0] bg-white py-2.5 text-sm text-[#475569] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          {loadingMore ? t("common.loading") : t("project.loadMore")}
        </button>
      )}
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
  currency,
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
  currency: string;
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
                      isSelected ? "bg-brand border-brand" : "border-[#CBD5E1]"
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
                <RecordCard {...r} currency={currency} />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(r.id);
                }}
                disabled={deletingId === r.id}
                className="w-[72px] shrink-0 bg-[#DC2626] text-white text-xs flex items-center justify-center"
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
          className="w-full bg-white text-[#475569] py-3 rounded-xl text-sm shadow-card btn-press disabled:opacity-50"
        >
          {loadingMore ? t("common.loading") : t("project.loadMore")}
        </button>
      )}
    </div>
  );
}
