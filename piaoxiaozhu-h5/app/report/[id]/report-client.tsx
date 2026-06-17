"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { generateReport } from "@/lib/report";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stat-card";
import dynamic from "next/dynamic";

const CostChart = dynamic(() => import("@/components/cost-chart"), {
  ssr: false,
  loading: () => <div className="h-52 bg-gray-100 rounded-md animate-pulse" />,
});
const MonthlyTrend = dynamic(() => import("@/components/monthly-trend"), {
  ssr: false,
  loading: () => <div className="h-52 bg-gray-100 rounded-md animate-pulse" />,
});
import { formatAmount } from "@/lib/utils";
import { useExportCsv } from "@/lib/hooks/use-export-csv";
import { RecordForReport as Record } from "@/types/record";

export default function ReportClient({
  projectId,
  records,
}: {
  projectId: string;
  records: Record[];
}) {
  const router = useRouter();
  const { exporting, handleExport } = useExportCsv(projectId);
  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [month, setMonth] = useState(() => currentMonth);

  const months = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.invoiceDate) set.add(r.invoiceDate.substring(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [records]);

  // 当月无数据时回退到"全部"
  const effectiveMonth = month && months.length > 0 && !months.includes(month) ? "" : month;

  const report = useMemo(
    () => generateReport(records, effectiveMonth || undefined),
    [records, effectiveMonth]
  );

  return (
    <div className="pb-16">
      <PageHeader
        title="利润报表"
        showBack
        onBack={() => router.push(`/project/${projectId}`)}
      />

      <div className="px-4 -mt-4 space-y-4">
        {records.length === 0 ? (
          <div className="bg-white rounded-md p-8 shadow-card text-center animate-fade-in-up">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm text-[#999999]">暂无记录，无法生成报表</p>
            <button
              onClick={() => router.push(`/project/${projectId}`)}
              className="text-sm text-brand mt-3 btn-press"
            >
              去添加记录 →
            </button>
          </div>
        ) : (
        <>
        <div className="flex gap-2 animate-fade-in-up stagger-1">
          <StatCard label="总收入" value={`¥${formatAmount(report.totalIncome)}`} color="#52C41A" />
          <StatCard label="总支出" value={`¥${formatAmount(report.totalExpense)}`} color="#FF4D4F" />
          <StatCard
            label="毛利润"
            value={`¥${formatAmount(report.grossProfit)}`}
            color={report.grossProfit >= 0 ? "#52C41A" : "#FF4D4F"}
          />
        </div>

        <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up stagger-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#666666]">毛利率</span>
            <span
              className="text-lg font-semibold"
              style={{ color: report.grossMargin >= 0 ? "#52C41A" : "#FF4D4F" }}
            >
              {report.grossMargin.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up stagger-3">
          <label className="block text-sm text-[#666666] mb-2">月份筛选</label>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setMonth("")}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                effectiveMonth === "" ? "bg-brand text-white" : "bg-gray-100 text-[#666666] hover:bg-gray-200"
              }`}
            >
              全部
            </button>
            {months.map((m) => (
              <button
                key={m}
                onClick={() => setMonth(m)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  effectiveMonth === m ? "bg-brand text-white" : "bg-gray-100 text-[#666666] hover:bg-gray-200"
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
          {exporting ? "导出中..." : "导出 CSV"}
        </button>

        <div className="animate-fade-in-up stagger-4">
          <CostChart data={report.categoryBreakdown} />
        </div>

        {report.monthlyData.length > 0 && (
          <div className="animate-fade-in-up stagger-5">
            <MonthlyTrend data={report.monthlyData} />
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
