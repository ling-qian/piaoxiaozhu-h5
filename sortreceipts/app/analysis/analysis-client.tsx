"use client";

import { CURRENCY_SYMBOL, NUMBER_LOCALE } from "@/lib/currency";
import { categoryLabel } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import MarkdownRenderer from "@/components/markdown-renderer";
import { useToast } from "@/components/toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface Props {
  projectId: string;
  projectName: string;
  existingAnalysis: string | null;
  analysisAt: string | null;
  planCode: string;
  initialSummary?: SummaryData | null;
}

interface SummaryData {
  totalIncome: number;
  totalExpense: number;
  grossProfit: number;
  grossMargin: number;
  categoryBreakdown: Record<string, number>;
  monthlyData: Record<string, { income: number; expense: number }>;
}

const PIE_COLORS = ["#2563EB", "#60A5FA", "#BFDBFE", "#DBEAFE", "#07C160", "#1677FF", "#722ED1", "#EB2F96", "#D97706", "#13C2C2"];

export default function AnalysisClient({
  projectId,
  projectName,
  existingAnalysis,
  analysisAt,
  planCode,
  initialSummary,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const { showToast } = useToast();
  const [analysis, setAnalysis] = useState(existingAnalysis);
  const [loading, setLoading] = useState(false);
  const [isPaid] = useState(planCode !== "free");
  const [summary, setSummary] = useState<SummaryData | null>(initialSummary || null);

  async function handleAnalyze() {
    if (!isPaid) {
      showToast(t("analysis.paidOnly"), "error");
      router.push("/member");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || t("analysis.failed"), "error");
        return;
      }

      setAnalysis(data.analysis);
      setSummary(data.summary || null);
      showToast(t("analysis.done"), "success");
    } catch {
      showToast(t("analysis.networkError"), "error");
    } finally {
      setLoading(false);
    }
  }

  // 月度趋势图表数据
  const monthlyChartData = summary
    ? Object.entries(summary.monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month: month.substring(5), // "2026-05" → "05"
          收入: Math.round(data.income),
          支出: Math.round(data.expense),
          利润: Math.round(data.income - data.expense),
        }))
    : [];

  // 分类饼图数据
  const categoryPieData = summary
    ? Object.entries(summary.categoryBreakdown)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, amt]) => ({
          name: categoryLabel(cat, t),
          value: Math.round(amt * 100) / 100,
        }))
    : [];

  return (
    <div className="pb-16 min-h-screen bg-[#F8FAFC] lg:pb-10">
      <PageHeader title={t("analysis.title")} showBack />

      <div className="px-4 pt-1 space-y-3 lg:mx-auto lg:max-w-3xl lg:space-y-4 lg:px-10 lg:pt-6">
        {/* 项目信息 */}
        <div className="bg-white rounded-md p-4 shadow-card animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#0F172A]">{projectName}</h2>
              {analysisAt && (
                <p className="text-xs text-[#64748B] mt-0.5">
                  {t("analysis.lastAt")} {new Date(analysisAt).toLocaleString(NUMBER_LOCALE)}
                </p>
              )}
            </div>
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="bg-brand text-white px-4 py-2 rounded-xl text-sm font-medium btn-press disabled:opacity-50"
            >
              {loading ? t("analysis.running") : analysis ? t("analysis.rerun") : t("analysis.start")}
            </button>
          </div>

          {!isPaid && (
            <div className="mt-3 bg-gradient-to-r from-brand/10 to-[#7C3AED]/10 rounded-lg p-3">
              <p className="text-xs text-[#475569]">
                {t("analysis.proOnlyA")} <span className="text-brand font-semibold">{t("analysis.pro")}</span> {t("analysis.proOnlyB")}
              </p>
              <button
                onClick={() => router.push("/member")}
                className="mt-1.5 text-xs text-brand font-medium btn-press"
              >
                {t("analysis.upgradeNow")} →
              </button>
            </div>
          )}
        </div>

        {/* 加载提示条（重新分析时显示，不覆盖已有数据） */}
        {loading && (
          <div className="bg-white rounded-md p-3 shadow-card animate-fade-in-up flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-brand/20 border-t-brand rounded-full animate-spin shrink-0" />
            <div>
              <p className="text-sm text-[#475569]">{t("analysis.analyzing")}</p>
              <p className="text-xs text-[#64748B]">{t("analysis.takesTime")}</p>
            </div>
          </div>
        )}

        {/* 数据概览卡片 */}
        {summary && (
          <div className="grid grid-cols-2 gap-2 animate-fade-in-up">
            <div className="bg-white rounded-md p-3 shadow-card">
              <p className="text-xs text-[#64748B]">{t("analysis.totalIncome")}</p>
              <p className="text-lg font-bold text-[#07C160]">{CURRENCY_SYMBOL}{summary.totalIncome.toLocaleString(NUMBER_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-white rounded-md p-3 shadow-card">
              <p className="text-xs text-[#64748B]">{t("analysis.totalExpense")}</p>
              <p className="text-lg font-bold text-[#2563EB]">{CURRENCY_SYMBOL}{summary.totalExpense.toLocaleString(NUMBER_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-white rounded-md p-3 shadow-card">
              <p className="text-xs text-[#64748B]">{t("analysis.grossProfit")}</p>
              <p className={`text-lg font-bold ${summary.grossProfit >= 0 ? "text-[#07C160]" : "text-[#DC2626]"}`}>
                {CURRENCY_SYMBOL}{summary.grossProfit.toLocaleString(NUMBER_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white rounded-md p-3 shadow-card">
              <p className="text-xs text-[#64748B]">{t("analysis.margin")}</p>
              <p className={`text-lg font-bold ${summary.grossMargin >= 0 ? "text-[#07C160]" : "text-[#DC2626]"}`}>
                {summary.grossMargin.toFixed(1)}%
              </p>
            </div>
          </div>
        )}

        {/* 月度收支趋势图 */}
        {summary && monthlyChartData.length > 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <h3 className="text-sm font-semibold text-[#0F172A] mb-3">{t("analysis.trend")}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748B" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} />
                <Tooltip
                  formatter={(value: number) => `${CURRENCY_SYMBOL}${value.toLocaleString(NUMBER_LOCALE)}`}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="收入" name={t("analysis.incomeSeries")} fill="#07C160" radius={[2, 2, 0, 0]} barSize={16} />
                <Bar dataKey="支出" name={t("analysis.expenseSeries")} fill="#2563EB" radius={[2, 2, 0, 0]} barSize={16} />
                <Bar dataKey="利润" name={t("analysis.profitSeries")} fill="#1677FF" radius={[2, 2, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 支出分类饼图 */}
        {summary && categoryPieData.length > 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <h3 className="text-sm font-semibold text-[#0F172A] mb-3">{t("analysis.breakdown")}</h3>
            <div className="flex items-center">
              <ResponsiveContainer width="55%" height={180}>
                <PieChart>
                  <Pie
                    data={categoryPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryPieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => `${CURRENCY_SYMBOL}${value.toLocaleString(NUMBER_LOCALE)}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {categoryPieData.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                    />
                    <span className="text-xs text-[#475569] truncate flex-1">{item.name}</span>
                    <span className="text-xs text-[#0F172A] font-medium shrink-0">
                      {summary.totalExpense > 0 ? ((item.value / summary.totalExpense) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 分析结果 */}
        {analysis && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <MarkdownRenderer content={analysis} />
          </div>
        )}

        {/* 无数据提示 */}
        {!analysis && !loading && !summary && (
          <div className="bg-white rounded-md p-8 shadow-card animate-fade-in-up text-center">
            <div className="text-5xl mb-3">📊</div>
            <h3 className="text-base font-semibold text-[#0F172A] mb-1">
              {t("analysis.noData")}
            </h3>
            <p className="text-sm text-[#64748B] leading-relaxed mb-4">
              {t("analysis.noDataHint")}
            </p>
            <button
              onClick={() => router.push(`/project/${projectId}`)}
              className="bg-brand text-white px-6 py-2.5 rounded-xl text-sm font-medium btn-press"
            >
              {t("analysis.goAdd")} →
            </button>
          </div>
        )}

        {/* 有数据但未分析 */}
        {!analysis && !loading && summary && (
          <div className="bg-white rounded-md p-8 shadow-card animate-fade-in-up text-center">
            <div className="text-5xl mb-3">🤖</div>
            <h3 className="text-base font-semibold text-[#0F172A] mb-1">
              {t("analysis.reportTitle")}
            </h3>
            <p className="text-sm text-[#64748B] leading-relaxed">
              {t("analysis.reportDesc")}
            </p>
            <p className="text-xs text-brand mt-3">{t("analysis.hintTopRight")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
