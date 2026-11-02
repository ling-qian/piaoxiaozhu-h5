"use client";

import { CURRENCY_SYMBOL } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CATEGORIES, categoryLabel } from "@/lib/constants";

interface CostChartProps {
  data: { code: string; name: string; amount: number; percentage: number }[];
}

const RADIAN = Math.PI / 180;

function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percentage,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percentage: number;
}) {
  if (percentage < 5) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {percentage.toFixed(0)}%
    </text>
  );
}

export default function CostChart({ data }: CostChartProps) {
  const { t } = useI18n();
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-md p-4 shadow-card text-center text-[#64748B] text-sm">
        {t("chart.noExpenseData")}
      </div>
    );
  }

  const chartData = data.map((d) => {
    const cat = CATEGORIES.find((c) => c.code === d.code);
    return {
      ...d,
      // 图例和 tooltip 都读 name，这里换成当前语言的分类名
      name: categoryLabel(d.code, t),
      color: cat?.color || "#64748B",
    };
  });

  return (
    <div className="bg-white rounded-md p-4 shadow-card">
      <h3 className="text-sm font-medium text-[#0F172A] mb-3">{t("chart.costDistribution")}</h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="amount"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              innerRadius={45}
              paddingAngle={2}
              label={renderCustomLabel}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => `${CURRENCY_SYMBOL}${value.toFixed(2)}`}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {chartData.map((d) => (
          <div key={d.code} className="flex items-center gap-1 text-xs">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-[#475569]">
              {d.name} {d.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
