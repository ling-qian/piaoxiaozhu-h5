"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface MonthlyTrendProps {
  data: { month: string; income: number; expense: number }[];
}

export default function MonthlyTrend({ data }: MonthlyTrendProps) {
  if (data.length === 0) return null;

  const chartData = data.map((d) => ({
    ...d,
    income: Math.round(d.income * 100) / 100,
    expense: Math.round(d.expense * 100) / 100,
  }));

  return (
    <div className="bg-white rounded-md p-4 shadow-card">
      <h3 className="text-sm font-medium text-[#333333] mb-3">月度趋势</h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#999999" }}
              tickFormatter={(v: string) => v.substring(5)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#999999" }}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `¥${value.toFixed(2)}`,
                name === "income" ? "收入" : "支出",
              ]}
              labelFormatter={(label: string) => `${label}`}
            />
            <Legend
              formatter={(value: string) => (value === "income" ? "收入" : "支出")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="income"
              stroke="#52C41A"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="expense"
              stroke="#FF4D4F"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
