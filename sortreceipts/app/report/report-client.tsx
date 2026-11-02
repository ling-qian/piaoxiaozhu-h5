"use client";

import { CURRENCY_SYMBOL } from "@/lib/currency";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { getRecordsForReport } from "@/lib/actions/record-actions";
import { generateReport } from "@/lib/report";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stat-card";
import CostChart from "@/components/cost-chart";
import TabBar from "@/components/tab-bar";
import { formatAmount } from "@/lib/utils";
import { CATEGORY_MAP, categoryLabel } from "@/lib/constants";
import { useExportCsv } from "@/lib/hooks/use-export-csv";
import { useI18n } from "@/lib/i18n";
import { RecordForReport as Record } from "@/types/record";
import ReportSkeleton from "@/components/report-skeleton";

const MonthlyTrend = dynamic(() => import("@/components/monthly-trend"), {
  ssr: false,
  loading: () => <div className="h-52 bg-gray-100 rounded-md animate-pulse" />,
});

interface Project {
  id: string;
  name: string;
}

interface SearchResult {
  records: Record[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { totalAmount: number; avgAmount: number };
}

export default function ReportClient({
  projectId,
  projects,
}: {
  projectId: string;
  projects: Project[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("project");
  const activeProjectId = urlProjectId || projectId;
  const { exporting, handleExport } = useExportCsv(activeProjectId);
  const { t } = useI18n();

  const [month, setMonth] = useState("");
  const [direction, setDirection] = useState("all");
  const [category, setCategory] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);

  // 月份选项
  const months = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.invoiceDate) set.add(r.invoiceDate.substring(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [records]);

  // 分类选项
  const categories = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.categoryCode) set.add(r.categoryCode);
    });
    return Array.from(set).sort();
  }, [records]);

  // 加载记录（全量用于报表统计）
  useEffect(() => {
    setLoading(true);
    getRecordsForReport(activeProjectId)
      .then((r) => {
        setRecords(r);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeProjectId]);

  // 搜索：如果有搜索条件，走后端 API
  const searchResults = useMemo(() => {
    if (!keyword && direction === "all" && category === "all") {
      return records;
    }
    // 前端过滤（数据量不大时够用）
    return records.filter((r) => {
      if (direction !== "all" && r.direction !== direction) return false;
      if (category !== "all" && r.categoryCode !== category) return false;
      if (keyword) {
        const kw = keyword.toLowerCase();
        return (
          (r.merchantName || "").toLowerCase().includes(kw) ||
          (r.invoiceNo || "").toLowerCase().includes(kw) ||
          (r.rawText || "").toLowerCase().includes(kw) ||
          (r.categoryL1 || "").toLowerCase().includes(kw) ||
          (r.categoryL2 || "").toLowerCase().includes(kw)
        );
      }
      return true;
    });
  }, [records, keyword, direction, category]);

  const report = useMemo(
    () => generateReport(searchResults, month || undefined),
    [searchResults, month]
  );

  // 当前月份过滤后的记录
  const filteredRecords = useMemo(() => {
    if (!month) return searchResults;
    return searchResults.filter((r) => r.invoiceDate?.startsWith(month));
  }, [searchResults, month]);

  if (loading) {
    return <ReportSkeleton />;
  }

  return (
    <div className="pb-16 min-h-screen bg-[#F8FAFC] lg:pb-10">
      <PageHeader title={t("report.profitReport")} />

      <div className="px-4 pt-1 space-y-4 lg:space-y-5 lg:px-10 lg:pt-6">
        {projects.length > 1 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => router.push(`/report?project=${p.id}`)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    activeProjectId === p.id ? "bg-brand text-white" : "bg-gray-100 text-[#475569] hover:bg-gray-200"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {records.length === 0 ? (
          <div className="bg-white rounded-md p-8 shadow-card text-center animate-fade-in-up stagger-1">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm text-[#64748B]">{t("report.noRecords")}</p>
            <button
              onClick={() => router.push("/")}
              className="text-sm text-brand mt-3 btn-press"
            >
              {t("report.addRecords")}
            </button>
          </div>
        ) : (
        <>
          {/* 搜索和筛选 */}
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up stagger-1">
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder={t("report.searchPlaceholder")}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="flex-1 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs text-[#64748B] shrink-0">{t("report.incomeExpense")}</span>
              {[
                { v: "all", l: t("report.all") },
                { v: "income", l: t("report.income") },
                { v: "out", l: t("report.expense") },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setDirection(opt.v)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    direction === opt.v ? "bg-brand text-white" : "bg-gray-100 text-[#475569] hover:bg-gray-200"
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              <span className="text-xs text-[#64748B] shrink-0">{t("project.category")}</span>
              <button
                onClick={() => setCategory("all")}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  category === "all" ? "bg-brand text-white" : "bg-gray-100 text-[#475569] hover:bg-gray-200"
                }`}
              >
                {t("report.all")}
              </button>
              {categories.map((c) => {
                return (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      category === c ? "bg-brand text-white" : "bg-gray-100 text-[#475569] hover:bg-gray-200"
                    }`}
                  >
                    {categoryLabel(c, t)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[#64748B] mt-2">{searchResults.length} {t("report.records")}</p>
          </div>

          {/* 统计卡片 */}
          <div className="flex gap-2 animate-fade-in-up stagger-1">
            <StatCard label={t("report.totalIncome")} value={`${CURRENCY_SYMBOL}${formatAmount(report.totalIncome)}`} color="#059669" />
            <StatCard label={t("report.totalExpense")} value={`${CURRENCY_SYMBOL}${formatAmount(report.totalExpense)}`} color="#DC2626" />
            <StatCard
              label={t("report.grossProfit")}
              value={`${CURRENCY_SYMBOL}${formatAmount(report.grossProfit)}`}
              color={report.grossProfit >= 0 ? "#059669" : "#DC2626"}
            />
          </div>

          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up stagger-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#475569]">{t("report.grossMargin")}</span>
              <span
                className="text-lg font-semibold"
                style={{ color: report.grossMargin >= 0 ? "#059669" : "#DC2626" }}
              >
                {report.grossMargin.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up stagger-3">
            <label className="block text-sm text-[#475569] mb-2">{t("report.monthFilter")}</label>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setMonth("")}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  month === "" ? "bg-brand text-white" : "bg-gray-100 text-[#475569] hover:bg-gray-200"
                }`}
              >
                {t("report.all")}
              </button>
              {months.map((m) => (
                <button
                  key={m}
                  onClick={() => setMonth(m)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    month === m ? "bg-brand text-white" : "bg-gray-100 text-[#475569] hover:bg-gray-200"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => handleExport()}
            disabled={exporting}
            className="w-full bg-white text-brand py-3 rounded-xl text-sm font-medium shadow-card disabled:opacity-50 btn-press animate-fade-in-up stagger-3 flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? t("report.exporting") : t("report.exportCsv")}
          </button>

          {/* 两个月度入口：会计要的整月交付包，和自己要看的毛利 */}
          <div className="grid grid-cols-2 gap-2 animate-fade-in-up stagger-3">
            <button
              onClick={() =>
                router.push(`/pack?project=${activeProjectId}${month ? `&month=${month}` : ""}`)
              }
              className="bg-white text-[#475569] py-3 rounded-xl text-sm font-medium shadow-card btn-press flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M4 4h16v16H4z" />
                <path d="M8 9h8M8 13h8M8 17h5" />
              </svg>
              {t("pack.entry")}
            </button>
            <button
              onClick={() =>
                router.push(`/sales?project=${activeProjectId}${month ? `&month=${month}` : ""}`)
              }
              className="bg-white text-[#475569] py-3 rounded-xl text-sm font-medium shadow-card btn-press flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="4" y1="20" x2="20" y2="20" />
                <line x1="7" y1="16" x2="7" y2="10" />
                <line x1="12" y1="16" x2="12" y2="5" />
                <line x1="17" y1="16" x2="17" y2="12" />
              </svg>
              {t("sales.entry")}
            </button>
          </div>

          {/* 两个图表：手机上下排，桌面并排 */}
          <div
            className={
              report.monthlyData.length > 0
                ? "space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0"
                : "space-y-4"
            }
          >
            <div className="animate-fade-in-up stagger-4">
              <CostChart data={report.categoryBreakdown} />
            </div>

            {report.monthlyData.length > 0 && (
              <div className="animate-fade-in-up stagger-5">
                <MonthlyTrend data={report.monthlyData} />
              </div>
            )}
          </div>

          {/* 明细表 */}
          <div className="bg-white rounded-md shadow-card animate-fade-in-up stagger-6">
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="w-full flex items-center justify-between p-4"
            >
              <h3 className="text-sm font-medium text-[#0F172A]">{t("report.detail")}</h3>
              <span className="text-xs text-brand">{showDetail ? t("report.detailCollapse") : `${t("report.viewDetail")} (${filteredRecords.length})`}</span>
            </button>
            {showDetail && (
              <div className="px-4 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0]">
                        <th className="text-left py-2 text-[#64748B] font-normal">{t("project.date")}</th>
                        <th className="text-left py-2 text-[#64748B] font-normal">{t("project.merchant")}</th>
                        <th className="text-left py-2 text-[#64748B] font-normal">{t("project.category")}</th>
                        <th className="text-right py-2 text-[#64748B] font-normal">{t("project.amount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((r) => {
                        const cat = CATEGORY_MAP[r.categoryCode];
                        return (
                          <tr key={r.id} className="border-b border-[#F1F5F9]">
                            <td className="py-2 text-[#475569] whitespace-nowrap">{r.invoiceDate || "-"}</td>
                            <td className="py-2 text-[#0F172A] max-w-[100px] truncate">{r.merchantName || "-"}</td>
                            <td className="py-2">
                              <span
                                className="inline-block px-1.5 py-0.5 rounded text-[10px] text-white"
                                style={{ backgroundColor: cat?.color || "#64748B" }}
                              >
                                {categoryLabel(r.categoryCode, t)}
                              </span>
                            </td>
                            <td className={`py-2 text-right whitespace-nowrap font-medium ${r.direction === "income" ? "text-success" : "text-error"}`}>
                              {r.direction === "income" ? "+" : "-"}{CURRENCY_SYMBOL}{formatAmount(r.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
        )}
      </div>
      <TabBar />
    </div>
  );
}
