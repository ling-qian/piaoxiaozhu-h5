"use client";

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

const PIE_COLORS = ["#FF6B35", "#FF8F65", "#FFB088", "#FFD4BC", "#07C160", "#1677FF", "#722ED1", "#EB2F96", "#FAAD14", "#13C2C2"];

const CATEGORY_LABELS: Record<string, string> = {
  food_purchase: "食材采购",
  rent_utility: "房租水电",
  labor: "人力成本",
  marketing: "营销推广",
  equipment: "设备维护",
  other: "其他",
  食材采购: "食材采购",
  房租水电: "房租水电",
  人力成本: "人力成本",
  营业收入: "营业收入",
  营销推广: "营销推广",
  设备维护: "设备维护",
  其他: "其他",
};

export default function AnalysisClient({
  projectId,
  projectName,
  existingAnalysis,
  analysisAt,
  planCode,
  initialSummary,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [analysis, setAnalysis] = useState(existingAnalysis);
  const [loading, setLoading] = useState(false);
  const [isPaid] = useState(planCode !== "free");
  const [summary, setSummary] = useState<SummaryData | null>(initialSummary || null);

  async function handleAnalyze() {
    if (!isPaid) {
      showToast("AI 经营分析为付费功能，请升级专业版", "error");
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
        showToast(data.error || "分析失败", "error");
        return;
      }

      setAnalysis(data.analysis);
      setSummary(data.summary || null);
      showToast("分析完成", "success");
    } catch {
      showToast("网络错误，请重试", "error");
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
          name: CATEGORY_LABELS[cat] || cat,
          value: Math.round(amt * 100) / 100,
        }))
    : [];

  return (
    <div className="pb-16 min-h-screen bg-[#F5F5F5]">
      <PageHeader title="AI 经营分析" showBack />

      <div className="px-4 pt-1 space-y-3">
        {/* 项目信息 */}
        <div className="bg-white rounded-md p-4 shadow-card animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#333333]">{projectName}</h2>
              {analysisAt && (
                <p className="text-xs text-[#999999] mt-0.5">
                  上次分析：{new Date(analysisAt).toLocaleString("zh-CN")}
                </p>
              )}
            </div>
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="bg-brand text-white px-4 py-2 rounded-xl text-sm font-medium btn-press disabled:opacity-50"
            >
              {loading ? "分析中..." : analysis ? "重新分析" : "开始分析"}
            </button>
          </div>

          {!isPaid && (
            <div className="mt-3 bg-gradient-to-r from-brand/10 to-[#FF8C42]/10 rounded-lg p-3">
              <p className="text-xs text-[#666666]">
                AI 经营分析为 <span className="text-brand font-semibold">专业版</span> 专属功能
              </p>
              <button
                onClick={() => router.push("/member")}
                className="mt-1.5 text-xs text-brand font-medium btn-press"
              >
                立即升级 →
              </button>
            </div>
          )}
        </div>

        {/* 加载提示条（重新分析时显示，不覆盖已有数据） */}
        {loading && (
          <div className="bg-white rounded-md p-3 shadow-card animate-fade-in-up flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-brand/20 border-t-brand rounded-full animate-spin shrink-0" />
            <div>
              <p className="text-sm text-[#666666]">AI 正在分析您的经营数据...</p>
              <p className="text-xs text-[#999999]">通常需要 10-20 秒</p>
            </div>
          </div>
        )}

        {/* 数据概览卡片 */}
        {summary && (
          <div className="grid grid-cols-2 gap-2 animate-fade-in-up">
            <div className="bg-white rounded-md p-3 shadow-card">
              <p className="text-xs text-[#999999]">总收入</p>
              <p className="text-lg font-bold text-[#07C160]">¥{summary.totalIncome.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-white rounded-md p-3 shadow-card">
              <p className="text-xs text-[#999999]">总支出</p>
              <p className="text-lg font-bold text-[#FF6B35]">¥{summary.totalExpense.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-white rounded-md p-3 shadow-card">
              <p className="text-xs text-[#999999]">毛利润</p>
              <p className={`text-lg font-bold ${summary.grossProfit >= 0 ? "text-[#07C160]" : "text-[#FF4D4F]"}`}>
                ¥{summary.grossProfit.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white rounded-md p-3 shadow-card">
              <p className="text-xs text-[#999999]">毛利率</p>
              <p className={`text-lg font-bold ${summary.grossMargin >= 0 ? "text-[#07C160]" : "text-[#FF4D4F]"}`}>
                {summary.grossMargin.toFixed(1)}%
              </p>
            </div>
          </div>
        )}

        {/* 月度收支趋势图 */}
        {summary && monthlyChartData.length > 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <h3 className="text-sm font-semibold text-[#333333] mb-3">月度收支趋势</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#999" }} />
                <YAxis tick={{ fontSize: 11, fill: "#999" }} />
                <Tooltip
                  formatter={(value: number) => `¥${value.toLocaleString()}`}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="收入" fill="#07C160" radius={[2, 2, 0, 0]} barSize={16} />
                <Bar dataKey="支出" fill="#FF6B35" radius={[2, 2, 0, 0]} barSize={16} />
                <Bar dataKey="利润" fill="#1677FF" radius={[2, 2, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 支出分类饼图 */}
        {summary && categoryPieData.length > 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <h3 className="text-sm font-semibold text-[#333333] mb-3">支出分类占比</h3>
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
                    formatter={(value: number) => `¥${value.toLocaleString()}`}
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
                    <span className="text-xs text-[#666666] truncate flex-1">{item.name}</span>
                    <span className="text-xs text-[#333333] font-medium shrink-0">
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
            <h3 className="text-base font-semibold text-[#333333] mb-1">
              暂无经营数据
            </h3>
            <p className="text-sm text-[#999999] leading-relaxed mb-4">
              先上传票据或添加收入记录，<br />
              AI 将为您生成深度经营分析报告
            </p>
            <button
              onClick={() => router.push(`/project/${projectId}`)}
              className="bg-brand text-white px-6 py-2.5 rounded-xl text-sm font-medium btn-press"
            >
              去添加记录 →
            </button>
          </div>
        )}

        {/* 有数据但未分析 */}
        {!analysis && !loading && summary && (
          <div className="bg-white rounded-md p-8 shadow-card animate-fade-in-up text-center">
            <div className="text-5xl mb-3">🤖</div>
            <h3 className="text-base font-semibold text-[#333333] mb-1">
              AI 利润分析与经营建议
            </h3>
            <p className="text-sm text-[#999999] leading-relaxed">
              基于您的收支数据，AI 将从利润健康度、成本结构、<br />
              月度趋势、商户集中度等维度深度分析，<br />
              并给出可落地的降本增效建议
            </p>
            <p className="text-xs text-brand mt-3">点击右上角"开始分析"即可生成报告</p>
          </div>
        )}
      </div>
    </div>
  );
}
