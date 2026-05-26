"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { generateReport } from "@/lib/report";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stat-card";
import CostChart from "@/components/cost-chart";
import { formatAmount } from "@/lib/utils";

interface Record {
  direction: string;
  amount: number;
  categoryCode: string;
  invoiceDate: string | null;
}

export default function ReportClient({
  projectId,
  records,
}: {
  projectId: string;
  records: Record[];
}) {
  const router = useRouter();
  const [month, setMonth] = useState("");

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

  return (
    <div className="pb-16">
      <PageHeader
        title="利润报表"
        showBack
        onBack={() => router.push(`/project/${projectId}`)}
      />

      <div className="px-4 -mt-4 space-y-4">
        <div className="flex gap-2">
          <StatCard label="总收入" value={`¥${formatAmount(report.totalIncome)}`} color="#52C41A" />
          <StatCard label="总支出" value={`¥${formatAmount(report.totalExpense)}`} color="#FF4D4F" />
          <StatCard
            label="毛利润"
            value={`¥${formatAmount(report.grossProfit)}`}
            color={report.grossProfit >= 0 ? "#52C41A" : "#FF4D4F"}
          />
        </div>

        <div className="bg-white rounded-md p-4 shadow-card">
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

        <div className="bg-white rounded-md p-4 shadow-card">
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

        <CostChart data={report.categoryBreakdown} />

        {report.monthlyData.length > 0 && (
          <div className="bg-white rounded-md p-4 shadow-card">
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
      </div>
    </div>
  );
}
