"use client";

import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";

const PLANS = [
  {
    code: "free",
    name: "免费版",
    price: 0,
    quotaLimit: 10,
    features: "每月10次识别\n基础分类\nCSV导出",
  },
  {
    code: "pro",
    name: "专业版",
    price: 29.9,
    quotaLimit: 200,
    features: "每月200次识别\n5层分类引擎\nExcel/CSV导出\nLLM智能分类",
  },
  {
    code: "enterprise",
    name: "企业版",
    price: 99,
    quotaLimit: -1,
    features: "无限次识别\n全部功能\n优先客服\nAPI接口",
  },
];

export default function MemberPage() {
  const router = useRouter();

  return (
    <div className="pb-20">
      <PageHeader title="会员套餐" showBack onBack={() => router.back()} />

      <div className="px-4 -mt-4 space-y-4">
        {PLANS.map((plan) => (
          <div
            key={plan.code}
            className={`bg-white rounded-md p-4 shadow-card ${
              plan.code === "pro" ? "ring-2 ring-brand" : ""
            }`}
          >
            {plan.code === "pro" && (
              <span className="inline-block bg-brand text-white text-xs px-2 py-0.5 rounded-full mb-2">
                推荐
              </span>
            )}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-[#333333]">
                {plan.name}
              </h3>
              <div>
                <span className="text-2xl font-bold text-brand">
                  ¥{plan.price}
                </span>
                <span className="text-xs text-[#999999]">/月</span>
              </div>
            </div>
            <p className="text-xs text-[#999999] mb-3">
              {plan.quotaLimit === -1
                ? "无限次识别"
                : `每月${plan.quotaLimit}次识别`}
            </p>
            <div className="space-y-1">
              {plan.features.split("\n").map((f, i) => (
                <p key={i} className="text-sm text-[#666666] flex items-center gap-1">
                  <span className="text-success">✓</span> {f}
                </p>
              ))}
            </div>
            <button
              className={`w-full mt-3 py-2 rounded-xl text-sm font-medium ${
                plan.code === "free"
                  ? "bg-gray-100 text-[#999999]"
                  : "bg-brand text-white"
              }`}
              disabled={plan.code === "free"}
            >
              {plan.code === "free" ? "当前套餐" : "立即开通"}
            </button>
          </div>
        ))}

        <div className="bg-brand-bg rounded-md p-4">
          <p className="text-xs text-[#666666]">
            💡 会员购买功能暂未开通，当前所有用户可免费使用基础功能。
          </p>
        </div>
      </div>
    </div>
  );
}
