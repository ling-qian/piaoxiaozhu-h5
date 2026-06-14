"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getRecordsForReport } from "@/lib/actions/record-actions";
import { generateReport } from "@/lib/report";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stat-card";
import CostChart from "@/components/cost-chart";
import { PageSpinner } from "@/components/spinner";
import { formatAmount } from "@/lib/utils";
import { CATEGORY_MAP } from "@/lib/constants";
import { useExportCsv } from "@/lib/hooks/use-export-csv";
import { RecordForReport as Record } from "@/types/record";

interface Project {
  id: string;
  name: string;
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

  const [month, setMonth] = useState("");
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    setLoading(true);
    getRecordsForReport(activeProjectId).then((r) => {
      setRecords(r);
      setLoading(false);
    });
  }, [activeProjectId]);

  const months = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.invoiceDate) set.add(r.invoiceDate.substring(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [records]);

  const report = useMemo(
    () => generateReport(records, month || undefined),
    [records, month]
  );

  if (loading) {
    return <PageSpinner text="加载报表" />;
  }

  return (
    <div className="pb-16">
      <PageHeader title="利润报表" />

      <div className="px-4 -mt-4 space-y-4">
        {projects.length > 1 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <select
              value={activeProjectId}
              onChange={(e) => router.push(`/report?project=${e.target.value}`)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {records.length === 0 ? (
          <div className="bg-white rounded-md p-8 shadow-card text-center animate-fade-in-up stagger-1">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm text-[#999999]">暂无记录，无法生成报表</p>
            <button
              onClick={() => router.push("/")}
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
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
          >
            <option value="">全部</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => handleExport(month)}
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
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up stagger-5">
            <h3 className="text-sm font-medium text-[#333333] mb-3">月度趋势</h3>
            <div className="space-y-2">
              {report.monthlyData.map((d) => (
                <div key={d.month} className="flex items-center justify-between text-sm">
                  <span className="text-[#666666]">{d.month}</span>
                  <div className="flex gap-4">
                    <span className="text-success">+¥{formatAmount(d.income)}</span>
                    <span className="text-error">-¥{formatAmount(d.expense)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 明细表 */}
        <div className="bg-white rounded-md shadow-card animate-fade-in-up stagger-6">
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="w-full flex items-center justify-between p-4"
          >
            <h3 className="text-sm font-medium text-[#333333]">收支明细</h3>
            <span className="text-xs text-brand">{showDetail ? "收起" : `查看 (${records.length}条)`}</span>
          </button>
          {showDetail && (
            <div className="px-4 pb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#EEEEEE]">
                      <th className="text-left py-2 text-[#999999] font-normal">日期</th>
                      <th className="text-left py-2 text-[#999999] font-normal">商户</th>
                      <th className="text-left py-2 text-[#999999] font-normal">分类</th>
                      <th className="text-right py-2 text-[#999999] font-normal">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records
                      .filter((r) => !month || r.invoiceDate?.startsWith(month))
                      .map((r) => {
                        const cat = CATEGORY_MAP[r.categoryCode];
                        return (
                          <tr key={r.id} className="border-b border-[#F5F5F5]">
                            <td className="py-2 text-[#666666] whitespace-nowrap">{r.invoiceDate || "-"}</td>
                            <td className="py-2 text-[#333333] max-w-[100px] truncate">{r.merchantName || "-"}</td>
                            <td className="py-2">
                              <span
                                className="inline-block px-1.5 py-0.5 rounded text-[10px] text-white"
                                style={{ backgroundColor: cat?.color || "#999" }}
                              >
                                {cat?.l1 || "其他"}
                              </span>
                            </td>
                            <td className={`py-2 text-right whitespace-nowrap font-medium ${r.direction === "income" ? "text-success" : "text-error"}`}>
                              {r.direction === "income" ? "+" : "-"}¥{formatAmount(r.amount)}
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
    </div>
  );
}
