"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import StatCard from "@/components/stat-card";
import RecordCard from "@/components/record-card";
import TabBar from "@/components/tab-bar";
import { formatAmount } from "@/lib/utils";

interface Stats {
  recordCount: number;
  totalIncome: number;
  totalExpense: number;
  grossProfit: number;
}

interface Record {
  id: string;
  direction: string;
  merchantName: string | null;
  amount: number;
  categoryCode: string;
  categoryL1: string;
  invoiceDate: string | null;
}

export default function ProjectDetailClient({
  projectId,
  stats,
  initialRecords,
}: {
  projectId: string;
  stats: Stats;
  initialRecords: Record[];
}) {
  const router = useRouter();
  const [records] = useState(initialRecords);

  return (
    <div className="pb-16">
      <PageHeader
        title="项目详情"
        showBack
        onBack={() => router.push("/")}
      />

      <div className="px-4 -mt-4 space-y-4">
        <div className="flex gap-2">
          <StatCard label="总收入" value={`¥${formatAmount(stats.totalIncome)}`} color="#52C41A" />
          <StatCard label="总支出" value={`¥${formatAmount(stats.totalExpense)}`} color="#FF4D4F" />
          <StatCard
            label="毛利润"
            value={`¥${formatAmount(stats.grossProfit)}`}
            color={stats.grossProfit >= 0 ? "#52C41A" : "#FF4D4F"}
          />
        </div>

        <div className="flex gap-2 animate-fade-in-up stagger-2">
          <button
            onClick={() => router.push(`/upload?project=${projectId}`)}
            className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-medium btn-press"
          >
            📷 拍照上传
          </button>
          <button
            onClick={() => router.push(`/result?project=${projectId}&manual=1`)}
            className="flex-1 bg-white text-brand border border-brand py-2.5 rounded-xl text-sm font-medium btn-press"
          >
            ✏️ 手动录入
          </button>
        </div>

        <div className="flex items-center justify-between animate-fade-in-up stagger-3">
          <h3 className="text-sm font-semibold text-[#333333]">
            记录 ({stats.recordCount})
          </h3>
          <button
            onClick={() => router.push(`/report/${projectId}`)}
            className="text-xs text-brand btn-press"
          >
            查看报表 →
          </button>
        </div>

        {records.length === 0 ? (
          <div className="bg-white rounded-md p-8 shadow-card text-center animate-fade-in-up">
            <p className="text-4xl mb-3">📝</p>
            <p className="text-sm text-[#999999]">暂无记录，开始上传票据吧</p>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((r, i) => (
              <div key={r.id} className={`stagger-${Math.min(i + 1, 6)}`}>
                <RecordCard {...r} />
              </div>
            ))}
          </div>
        )}
      </div>

      <TabBar projectId={projectId} />
    </div>
  );
}
