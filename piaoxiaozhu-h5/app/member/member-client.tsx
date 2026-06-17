"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/toast";
import PageHeader from "@/components/page-header";

const plans = [
  {
    code: "free",
    name: "免费版",
    price: "0",
    features: ["无限发票识别", "无限项目", "基础报表", "数据导出"],
    color: "#999999",
    highlight: false,
  },
  {
    code: "pro",
    name: "专业版",
    price: "29",
    features: [
      "免费版全部功能",
      "AI 利润分析",
      "AI 经营建议",
      "成本优化方案",
      "月度趋势洞察",
    ],
    color: "#FF6B35",
    highlight: true,
  },
  {
    code: "enterprise",
    name: "企业版",
    price: "99",
    features: [
      "专业版全部功能",
      "多门店对比分析",
      "行业基准对标",
      "专属财务顾问",
      "优先支持",
    ],
    color: "#722ED1",
    highlight: false,
  },
];

interface QrConfig {
  wechatPayQrUrl: string;
  alipayQrUrl: string;
  hasStripe: boolean;
}

export default function MemberClient({ currentPlan }: { currentPlan: string }) {
  const { showToast } = useToast();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payPlan, setPayPlan] = useState<{ code: string; name: string; price: string } | null>(null);
  const [payMethod, setPayMethod] = useState<"wechat" | "alipay">("wechat");
  const [qrConfig, setQrConfig] = useState<QrConfig | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetch("/api/payment/qr")
      .then((r) => r.json())
      .then((data) => setQrConfig(data))
      .catch(() => {
        // QR config is optional — if fetch fails, QR modal will show placeholder images
        console.warn("Failed to load payment QR config");
      });
  }, []);

  async function handlePurchase(planCode: string) {
    if (planCode === "free") return;

    const plan = plans.find((p) => p.code === planCode);
    if (!plan) return;

    // 如果配置了 Stripe，走 Stripe
    if (qrConfig?.hasStripe) {
      setPurchasing(planCode);
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planCode }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          showToast(data.error || "升级失败", "error");
        }
      } catch {
        showToast("网络错误，请重试", "error");
      } finally {
        setPurchasing(null);
      }
      return;
    }

    // 展示收款码弹窗
    setPayPlan({ code: planCode, name: plan.name, price: plan.price });
    setShowPayModal(true);
  }

  async function handleConfirmPay() {
    if (!payPlan) return;
    setConfirming(true);
    try {
      if (qrConfig?.hasStripe) {
        // Stripe 模式：跳转 Stripe 支付页面
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planCode: payPlan.code }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          showToast(data.error || "升级失败", "error");
        }
      } else {
        // 二维码模式：手动确认支付，直接升级
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planCode: payPlan.code, manualConfirm: true }),
        });
        const data = await res.json();
        if (data.success) {
          showToast("升级成功！", "success");
          setShowPayModal(false);
          setTimeout(() => window.location.reload(), 1000);
        } else {
          showToast(data.error || "升级失败，请联系客服", "error");
        }
      }
    } catch {
      showToast("网络错误，请重试", "error");
    } finally {
      setConfirming(false);
    }
  }

  const currentQrUrl = payMethod === "wechat" ? qrConfig?.wechatPayQrUrl : qrConfig?.alipayQrUrl;

  return (
    <div className="pb-20 min-h-screen bg-[#F5F5F5]">
      <PageHeader title="会员套餐" showBack onBack={() => history.back()} />

      <div className="px-4 -mt-4 space-y-3">
        {plans.map((plan, i) => {
          const isCurrent = plan.code === currentPlan;
          const isPurchasing = purchasing === plan.code;
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
                  {plan.highlight && !isCurrent && (
                    <span className="text-[10px] bg-[#FF6B35]/10 text-[#FF6B35] px-1.5 py-0.5 rounded-full">
                      推荐
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
                    : handlePurchase(plan.code)
                }
                disabled={isPurchasing}
                className={`w-full py-2.5 rounded-xl text-sm font-medium btn-press transition-all duration-200 disabled:opacity-50 ${
                  isCurrent
                    ? "bg-gray-100 text-[#999999]"
                    : "text-white"
                }`}
                style={!isCurrent ? { backgroundColor: plan.color } : undefined}
              >
                {isPurchasing ? "跳转支付..." : isCurrent ? "当前套餐" : "立即购买"}
              </button>
            </div>
          );
        })}
      </div>

      {/* 支付二维码弹窗 */}
      {showPayModal && payPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-white rounded-xl mx-6 w-full max-w-sm overflow-hidden animate-fade-in-up">
            {/* 头部 */}
            <div className="bg-gradient-to-r from-[#FF6B35] to-[#FF8F65] px-5 py-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">升级到{payPlan.name}</p>
                  <p className="text-2xl font-bold">¥{payPlan.price}<span className="text-sm font-normal opacity-80">/月</span></p>
                </div>
                <button
                  onClick={() => setShowPayModal(false)}
                  className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 支付方式切换 */}
            <div className="flex border-b border-[#EEEEEE]">
              <button
                onClick={() => setPayMethod("wechat")}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  payMethod === "wechat" ? "text-[#07C160] border-b-2 border-[#07C160]" : "text-[#999999]"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.062-6.122zM14.033 13.3c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982z"/></svg>
                微信支付
              </button>
              <button
                onClick={() => setPayMethod("alipay")}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  payMethod === "alipay" ? "text-[#1677FF] border-b-2 border-[#1677FF]" : "text-[#999999]"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M21.422 15.358c-3.32-1.326-6.092-2.786-6.092-2.786s1.44-3.96.36-5.88c-1.08-1.92-3.84-1.56-3.84-1.56s-1.08-.12-2.16.72c-1.08.84-1.56 2.4-1.56 2.4s-.6 1.92.12 3.84c.72 1.92 2.64 2.64 2.64 2.64s-1.32 2.16-3.72 3.48C4.682 19.534 2.522 18.574.922 17.074c-1.2-1.14-.84-2.64-.84-2.64s.24-1.08 1.56-1.56c1.32-.48 2.16.6 2.16.6s.84 1.08.24 2.28c-.6 1.2-1.92 1.08-1.92 1.08s1.32 1.44 3.48.96c2.16-.48 3.6-2.28 3.6-2.28s-2.76-1.56-3.12-4.32c-.36-2.76 1.32-4.92 1.32-4.92S9.502 4.354 12.382 4.114c2.88-.24 4.56 1.68 4.56 1.68s1.56 1.92 1.2 4.44c-.36 2.52-2.28 4.08-2.28 4.08s2.64 1.2 5.52 2.16c0 0 .84.36.84 1.08 0 .72-.96.84-.96.84l.16-1.04z"/></svg>
                支付宝
              </button>
            </div>

            {/* 二维码区域 */}
            <div className="px-5 py-5 flex flex-col items-center">
              {currentQrUrl ? (
                <div className="w-48 h-48 bg-[#F8F8F8] rounded-lg flex items-center justify-center overflow-hidden border-2 border-[#EEEEEE]">
                  <img
                    src={currentQrUrl}
                    alt={`${payMethod === "wechat" ? "微信" : "支付宝"}收款码`}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 bg-[#F8F8F8] rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-[#CCCCCC]">
                  <span className="text-3xl mb-2">{payMethod === "wechat" ? "💚" : "💙"}</span>
                  <span className="text-xs text-[#999999]">扫码支付</span>
                  <span className="text-xs text-[#999999] mt-1">¥{payPlan.price}/月</span>
                </div>
              )}

              <p className="text-xs text-[#999999] mt-3 text-center">
                请使用{payMethod === "wechat" ? "微信" : "支付宝"}扫描上方二维码<br />
                支付金额：<span className="text-[#FF6B35] font-bold">¥{payPlan.price}.00</span>
              </p>

              {/* 我已支付按钮 */}
              <button
                onClick={handleConfirmPay}
                disabled={confirming}
                className="w-full mt-4 py-3 rounded-xl text-white text-sm font-medium btn-press transition-all duration-200 disabled:opacity-50"
                style={{ backgroundColor: payMethod === "wechat" ? "#07C160" : "#1677FF" }}
              >
                {confirming ? "确认中..." : "我已支付，立即升级"}
              </button>

              <p className="text-[10px] text-[#BBBBBB] mt-2 text-center">
                支付后点击上方按钮即可升级，如有问题请联系客服
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
