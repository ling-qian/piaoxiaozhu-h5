"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";

interface TrendItem {
  label: string;
  income: number;
  expense: number;
}

interface CategoryItem {
  name: string;
  amount: number;
}

interface DashboardData {
  trend: TrendItem[];
  summary: {
    income: number;
    expense: number;
    net: number;
    recordCount: number;
  };
  topCategories: CategoryItem[];
}

export default function DashboardCard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  const { trend, summary, topCategories } = data;

  // 趋势图计算
  const maxVal = Math.max(
    ...trend.flatMap((t) => [t.income, t.expense]),
    1
  );
  const chartH = 120;
  const barW = 16;
  const gap = (100 - barW * 2) / 100; // 间距占比

  return (
    <div className="space-y-3 animate-fade-in-up">
      {/* 本月汇总 */}
      <div className="bg-white rounded-xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#333]">{t("dashboard.monthOverview")}</h3>
          <span className="text-xs text-[#999]">{summary.recordCount} {t("dashboard.records")}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-xs text-[#999] mb-1">{t("dashboard.income")}</p>
            <p className="text-lg font-bold text-[#52C41A]">
              ¥{summary.income.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#999] mb-1">{t("dashboard.expense")}</p>
            <p className="text-lg font-bold text-[#FF4D4F]">
              ¥{summary.expense.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#999] mb-1">{t("dashboard.net")}</p>
            <p className={`text-lg font-bold ${summary.net >= 0 ? "text-[#52C41A]" : "text-[#FF4D4F]"}`}>
              ¥{summary.net.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* 趋势图 */}
      {trend.some((t) => t.income > 0 || t.expense > 0) && (
        <div className="bg-white rounded-xl p-4 shadow-card">
          <h3 className="text-sm font-semibold text-[#333] mb-3">{t("dashboard.trend")}</h3>
          <div className="flex items-end justify-between gap-1" style={{ height: chartH }}>
            {trend.map((t, i) => {
              const incomeH = Math.max((t.income / maxVal) * (chartH - 20), t.income > 0 ? 4 : 0);
              const expenseH = Math.max((t.expense / maxVal) * (chartH - 20), t.expense > 0 ? 4 : 0);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="flex items-end gap-[2px]" style={{ height: chartH - 20 }}>
                    <div
                      className="w-[40%] rounded-t-sm bg-[#52C41A] transition-all duration-500"
                      style={{ height: incomeH }}
                      title={`收入: ¥${t.income}`}
                    />
                    <div
                      className="w-[40%] rounded-t-sm bg-[#FF4D4F] transition-all duration-500"
                      style={{ height: expenseH }}
                      title={`支出: ¥${t.expense}`}
                    />
                  </div>
                  <span className="text-[10px] text-[#999]">{t.label}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-4 mt-2">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#52C41A]" />
              <span className="text-[10px] text-[#999]">{t("dashboard.income")}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#FF4D4F]" />
              <span className="text-[10px] text-[#999]">{t("dashboard.expense")}</span>
            </div>
          </div>
        </div>
      )}

      {/* 分类支出 Top5 */}
      {topCategories.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-card">
          <h3 className="text-sm font-semibold text-[#333] mb-3">{t("dashboard.category")}</h3>
          <div className="space-y-2">
            {topCategories.map((cat, i) => {
              const total = topCategories.reduce((s, c) => s + c.amount, 0);
              const pct = total > 0 ? (cat.amount / total) * 100 : 0;
              const colors = ["#FF6B35", "#FF8F65", "#FFA940", "#FFC53D", "#FFD666"];
              return (
                <div key={cat.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#666]">{cat.name}</span>
                    <span className="text-xs text-[#999]">
                      ¥{cat.amount.toLocaleString()} · {Math.round(pct)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
