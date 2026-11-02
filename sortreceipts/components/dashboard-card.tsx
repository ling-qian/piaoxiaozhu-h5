"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { categoryLabel } from "@/lib/constants";
import { formatPrice, CURRENCY_SYMBOL, NUMBER_LOCALE } from "@/lib/currency";

interface TrendItem {
  label: string;
  year?: number;
  month?: number;
  income: number;
  expense: number;
}

interface CategoryItem {
  code: string;
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
      <div className="bg-white rounded-xl p-4 shadow-card lg:p-6">
        <div className="flex items-center justify-between mb-3 lg:mb-5">
          <h3 className="text-sm font-semibold text-[#0F172A] lg:text-[15px]">{t("dashboard.monthOverview")}</h3>
          <span className="text-xs text-[#64748B] lg:text-[13px]">{summary.recordCount} {t("dashboard.records")}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center lg:text-left">
            <p className="text-xs text-[#64748B] mb-1">{t("dashboard.income")}</p>
            <p className="text-lg font-bold text-[#059669] lg:text-[26px] lg:tracking-tight">
              {CURRENCY_SYMBOL}{summary.income.toLocaleString(NUMBER_LOCALE)}
            </p>
          </div>
          <div className="text-center lg:text-left">
            <p className="text-xs text-[#64748B] mb-1">{t("dashboard.expense")}</p>
            <p className="text-lg font-bold text-[#DC2626] lg:text-[26px] lg:tracking-tight">
              {CURRENCY_SYMBOL}{summary.expense.toLocaleString(NUMBER_LOCALE)}
            </p>
          </div>
          <div className="text-center lg:text-left">
            <p className="text-xs text-[#64748B] mb-1">{t("dashboard.net")}</p>
            <p className={`text-lg font-bold lg:text-[26px] lg:tracking-tight ${summary.net >= 0 ? "text-[#2563EB]" : "text-[#DC2626]"}`}>
              {CURRENCY_SYMBOL}{summary.net.toLocaleString(NUMBER_LOCALE)}
            </p>
          </div>
        </div>
      </div>

      {/* 趋势图 */}
      {trend.some((t) => t.income > 0 || t.expense > 0) && (
        <div className="bg-white rounded-xl p-4 shadow-card">
          <h3 className="text-sm font-semibold text-[#0F172A] mb-3">{t("dashboard.trend")}</h3>
          <div className="flex items-end justify-between gap-1" style={{ height: chartH }}>
            {trend.map((point, i) => {
              const incomeH = Math.max((point.income / maxVal) * (chartH - 20), point.income > 0 ? 4 : 0);
              const expenseH = Math.max((point.expense / maxVal) * (chartH - 20), point.expense > 0 ? 4 : 0);
              // 后端给年月，标签按当前语言渲染；老响应没有年月时退回 label
              const monthLabel =
                point.year !== undefined && point.month !== undefined
                  ? new Date(point.year, point.month - 1, 1).toLocaleDateString(NUMBER_LOCALE, { month: "short" })
                  : point.label;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  {/* w-full 不能省：柱子按百分比定宽，容器没有宽度时会缩成 0 */}
                  <div className="flex items-end justify-center gap-[2px] w-full" style={{ height: chartH - 20 }}>
                    <div
                      className="w-[40%] rounded-t-sm bg-[#059669] transition-all duration-500"
                      style={{ height: incomeH }}
                      title={`${t("dashboard.income")}: ${formatPrice(point.income, point.income)}`}
                    />
                    <div
                      className="w-[40%] rounded-t-sm bg-[#DC2626] transition-all duration-500"
                      style={{ height: expenseH }}
                      title={`${t("dashboard.expense")}: ${formatPrice(point.expense, point.expense)}`}
                    />
                  </div>
                  <span className="text-[10px] text-[#64748B]">{monthLabel}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-4 mt-2">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#059669]" />
              <span className="text-[10px] text-[#64748B]">{t("dashboard.income")}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626]" />
              <span className="text-[10px] text-[#64748B]">{t("dashboard.expense")}</span>
            </div>
          </div>
        </div>
      )}

      {/* 分类支出 Top5 */}
      {topCategories.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-card">
          <h3 className="text-sm font-semibold text-[#0F172A] mb-3">{t("dashboard.category")}</h3>
          <div className="space-y-2">
            {topCategories.map((cat, i) => {
              const total = topCategories.reduce((s, c) => s + c.amount, 0);
              const pct = total > 0 ? (cat.amount / total) * 100 : 0;
              const colors = ["#2563EB", "#60A5FA", "#93C5FD", "#FFC53D", "#FFD666"];
              return (
                <div key={cat.code}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#475569]">{categoryLabel(cat.code, t)}</span>
                    <span className="text-xs text-[#64748B]">
                      {CURRENCY_SYMBOL}{cat.amount.toLocaleString(NUMBER_LOCALE)} · {Math.round(pct)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#F8FAFC] rounded-full overflow-hidden">
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
