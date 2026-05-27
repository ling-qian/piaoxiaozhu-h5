"use client";

import { useToast } from "@/components/toast";
import PageHeader from "@/components/page-header";

const plans = [
  {
    code: "free",
    name: "免费版",
    price: "0",
    features: ["每月10次OCR识别", "1个项目", "基础报表"],
    color: "#999999",
  },
  {
    code: "pro",
    name: "专业版",
    price: "29",
    features: ["每月100次OCR识别", "5个项目", "高级报表", "数据导出"],
    color: "#FF6B35",
  },
  {
    code: "enterprise",
    name: "企业版",
    price: "99",
    features: ["无限OCR识别", "无限项目", "全部功能", "优先支持"],
    color: "#722ED1",
  },
];

export default function MemberClient({ currentPlan }: { currentPlan: string }) {
  const { showToast } = useToast();

  return (
    <div className="pb-20">
      <PageHeader title="会员套餐" showBack onBack={() => history.back()} />

      <div className="px-4 -mt-4 space-y-3">
        {plans.map((plan, i) => {
          const isCurrent = plan.code === currentPlan;
          return (
            <div
              key={plan.code}
              className={`bg-white rounded-md p-5 shadow-card animate-fade-in-up stagger-${i + 1}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: plan.color }}
                  />
                  <span className="font-semibold text-[#333333]">{plan.name}</span>
                  {isCurrent && (
                    <span className="text-[10px] bg-brand/10 text-brand px-1.5 py-0.5 rounded-full">
                      当前
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold" style={{ color: plan.color }}>
                    ¥{plan.price}
                  </span>
                  <span className="text-xs text-[#999999]">/月</span>
                </div>
              </div>

              <ul className="space-y-1.5 mb-4">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-[#666666] flex items-center gap-2">
                    <span className="text-success text-xs">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() =>
                  isCurrent
                    ? showToast("当前套餐", "info")
                    : showToast("即将开放购买", "info")
                }
                className={`w-full py-2.5 rounded-xl text-sm font-medium btn-press transition-all duration-200 ${
                  isCurrent
                    ? "bg-gray-100 text-[#999999]"
                    : "text-white"
                }`}
                style={!isCurrent ? { backgroundColor: plan.color } : undefined}
              >
                {isCurrent ? "当前套餐" : "立即购买"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
