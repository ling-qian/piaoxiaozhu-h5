"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CATEGORIES } from "@/lib/constants";

interface CostChartProps {
  data: { code: string; name: string; amount: number; percentage: number }[];
}

export default function CostChart({ data }: CostChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-md p-4 shadow-card text-center text-[#999999] text-sm">
        暂无支出数据
      </div>
    );
  }

  const chartData = data.map((d) => {
    const cat = CATEGORIES.find((c) => c.code === d.code);
    return {
      ...d,
      color: cat?.color || "#999999",
    };
  });

  return (
    <div className="bg-white rounded-md p-4 shadow-card">
      <h3 className="text-sm font-medium text-[#333333] mb-3">成本分布</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="amount"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={70}
              innerRadius={40}
              paddingAngle={2}
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => `¥${value.toFixed(2)}`}
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
            <span className="text-[#666666]">
              {d.name} {d.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
