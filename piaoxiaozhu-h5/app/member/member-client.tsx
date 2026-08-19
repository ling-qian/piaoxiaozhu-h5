"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";
import PageHeader from "@/components/page-header";

const plans = [
  {
    code: "free",
    nameKey: "member.free",
    descKey: "member.suitPersonal",
    price: "0",
    unitKey: "",
    features: [
      { key: "member.freeInvoices", included: true },
      { key: "member.oneProject", included: true },
      { key: "member.basicReport", included: true },
      { key: "member.dataExport", included: false },
      { key: "member.aiAnalysis", included: false },
      { key: "member.costOptimize", included: false },
    ],
    gradient: "from-[#E8E8E8] to-[#D4D4D4]",
    accentColor: "#999999",
    iconColor: "#BBBBBB",
  },
  {
    code: "pro",
    nameKey: "member.pro",
    descKey: "member.suitBusiness",
    price: "29",
    unitKey: "member.perMonth",
    features: [
      { key: "member.proInvoices", included: true },
      { key: "member.tenProjects", included: true },
      { key: "member.dataExport", included: true },
      { key: "member.proAiAnalysis", included: true },
      { key: "member.costOptimize", included: true },
      { key: "member.financialAdvisor", included: false },
    ],
    gradient: "from-[#FF6B35] to-[#FF8F65]",
    accentColor: "#FF6B35",
    iconColor: "#FF6B35",
    badgeKey: "member.recommended",
  },
  {
    code: "enterprise",
    nameKey: "member.enterprise",
    descKey: "member.suitEnterprise",
    price: "99",
    unitKey: "member.perMonth",
    features: [
      { key: "member.unlimitedInvoices", included: true },
      { key: "member.unlimitedProjects", included: true },
      { key: "member.unlimitedAiAnalysis", included: true },
      { key: "member.multiStore", included: true },
      { key: "member.industryBenchmark", included: true },
      { key: "member.financialAdvisor", included: true },
    ],
    gradient: "from-[#722ED1] to-[#9254DE]",
    accentColor: "#722ED1",
    iconColor: "#722ED1",
  },
];

interface QrConfig {
  wechatPayQrUrl: string;
  alipayQrUrl: string;
  hasStripe: boolean;
}

interface UpgradeRequest {
  id: string;
  planCode: string;
  payMethod: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
}

type PayMethod = "wechat" | "alipay" | "card";

export default function MemberClient({ currentPlan }: { currentPlan: string }) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payPlan, setPayPlan] = useState<{ code: string; name: string; price: string; accentColor: string } | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("wechat");
  const [qrConfig, setQrConfig] = useState<QrConfig | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<UpgradeRequest[]>([]);

  // 处理 Stripe 支付成功回调
  useEffect(() => {
    if (searchParams.get("success") === "1") {
      const plan = searchParams.get("plan");
      showToast(`${t("member.paymentSuccess")}${plan ? t(plans.find((p) => p.code === plan)?.nameKey || "") : t("member.planUpgraded")}`, "success");
      // 清除 URL 参数
      window.history.replaceState({}, "", "/member");
      // 刷新升级请求
      fetch("/api/upgrade-requests")
        .then((r) => r.json())
        .then((data) => { if (data.requests) setPendingRequests(data.requests); })
        .catch(() => {});
    } else if (searchParams.get("cancel") === "1") {
      showToast(t("member.paymentCancelled"), "info");
      window.history.replaceState({}, "", "/member");
    }
  }, [searchParams, showToast]);

  useEffect(() => {
    fetch("/api/payment/qr")
      .then((r) => r.json())
      .then((data) => setQrConfig(data))
      .catch(() => {});

    fetch("/api/upgrade-requests")
      .then((r) => r.json())
      .then((data) => {
        if (data.requests) setPendingRequests(data.requests);
      })
      .catch(() => {});
  }, []);

  async function handlePurchase(planCode: string) {
    if (planCode === "free") return;
    const plan = plans.find((p) => p.code === planCode);
    if (!plan) return;

    // 弹出支付方式选择弹窗
    setPayPlan({ code: planCode, name: t(plan.nameKey), price: plan.price, accentColor: plan.accentColor });
    setShowPayModal(true);
  }

  // Stripe 模式：选择支付方式后跳转 Stripe Checkout
  async function handleStripeCheckout() {
    if (!payPlan) return;
    setPurchasing(payPlan.code);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: payPlan.code, payMethod }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error || t("member.createPaymentFailed"), "error");
      }
    } catch {
      showToast(t("member.networkError"), "error");
    } finally {
      setPurchasing(null);
    }
  }

  // 人工审核模式：提交"我已支付"审核请求
  async function handleConfirmPay() {
    if (!payPlan) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: payPlan.code, payMethod }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(t("member.upgradeSubmitted"), "success");
        setShowPayModal(false);
        const reqRes = await fetch("/api/upgrade-requests");
        const reqData = await reqRes.json();
        if (reqData.requests) setPendingRequests(reqData.requests);
      } else {
        showToast(data.error || t("member.submitFailed"), "error");
      }
    } catch {
      showToast(t("member.networkError"), "error");
    } finally {
      setConfirming(false);
    }
  }

  const currentQrUrl = payMethod === "wechat" ? qrConfig?.wechatPayQrUrl : qrConfig?.alipayQrUrl;
  const pendingPlanNames = pendingRequests
    .filter((r) => r.status === "pending")
    .map((r) => { const p = plans.find((p) => p.code === r.planCode); return p ? t(p.nameKey) : r.planCode; });

  const isStripeMode = qrConfig?.hasStripe;

  return (
    <div className="pb-20 min-h-screen bg-[#F5F5F5]">
      <PageHeader title={t("member.title")} showBack onBack={() => history.back()} />

      <div className="px-4 pt-2 space-y-3">
        {/* 待审核提示 */}
        {pendingRequests.filter((r) => r.status === "pending").length > 0 && (
          <div className="bg-[#FFF7E6] border border-[#FFD591] rounded-xl p-3 flex items-start gap-2">
            <span className="text-[#FA8C16] text-sm mt-0.5">⏳</span>
            <div>
              <p className="text-sm text-[#D46B08] font-medium">{t("member.upgradeReviewing")}</p>
              <p className="text-xs text-[#AD6800] mt-0.5">
                {pendingPlanNames.join("、")} — {t("member.adminConfirm")}
              </p>
            </div>
          </div>
        )}

        {/* 被拒绝提示 */}
        {pendingRequests.filter((r) => r.status === "rejected").map((req) => (
          <div key={req.id} className="bg-[#FFF1F0] border border-[#FFA39E] rounded-xl p-3 flex items-start gap-2">
            <span className="text-[#F5222D] text-sm mt-0.5">✕</span>
            <div>
              <p className="text-sm text-[#CF1322] font-medium">
                {(() => { const p = plans.find((p) => p.code === req.planCode); return p ? t(p.nameKey) : req.planCode; })()}{t("member.upgradeRejected")}
              </p>
              {req.reviewNote && <p className="text-xs text-[#A8071A] mt-0.5">{req.reviewNote}</p>}
            </div>
          </div>
        ))}

        {/* 套餐卡片 */}
        {plans.map((plan, i) => {
          const isCurrent = plan.code === currentPlan;
          const isPurchasing = purchasing === plan.code;
          const hasPending = pendingRequests.some((r) => r.planCode === plan.code && r.status === "pending");

          return (
            <div
              key={plan.code}
              className={`relative bg-white rounded-2xl overflow-hidden shadow-card animate-fade-in-up stagger-${i + 1} ${
                plan.code === "pro" ? "ring-2 ring-[#FF6B35]/30" : ""
              }`}
            >
              {/* 顶部渐变条 */}
              <div className={`h-1.5 bg-gradient-to-r ${plan.gradient}`} />

              {/* 推荐角标 */}
              {plan.badgeKey && !isCurrent && (
                <div className="absolute top-4 right-0">
                  <div className="bg-[#FF6B35] text-white text-[10px] font-bold px-3 py-0.5 rounded-l-full">
                    {t(plan.badgeKey)}
                  </div>
                </div>
              )}

              <div className="p-5">
                {/* 套餐名 + 价格 */}
                <div className="flex items-end justify-between mb-1">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-[#333333]">{t(plan.nameKey)}</span>
                      {isCurrent && (
                        <span className="text-[10px] bg-[#F0FFF0] text-[#52C41A] px-2 py-0.5 rounded-full font-medium">
                          {t("member.currentPlanLabel")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#999999] mt-0.5">{t(plan.descKey)}</p>
                  </div>
                  <div className="text-right flex items-baseline gap-0.5">
                    <span className="text-xs" style={{ color: plan.accentColor }}>¥</span>
                    <span className="text-3xl font-black tracking-tight" style={{ color: plan.accentColor }}>
                      {plan.price}
                    </span>
                    {plan.unitKey && <span className="text-xs text-[#BBBBBB]">{t(plan.unitKey)}</span>}
                  </div>
                </div>

                {/* 分割线 */}
                <div className="border-t border-[#F5F5F5] my-3" />

                {/* 功能列表 */}
                <div className="space-y-2 mb-5">
                  {plan.features.map((f) => (
                    <div key={f.key} className="flex items-center gap-2.5">
                      {f.included ? (
                        <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${plan.accentColor}15` }}>
                          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke={plan.accentColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 bg-[#F5F5F5]">
                          <span className="text-[8px] text-[#CCCCCC]">—</span>
                        </div>
                      )}
                      <span className={`text-sm ${f.included ? "text-[#444444]" : "text-[#CCCCCC]"}`}>
                        {t(f.key)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 按钮 */}
                {plan.code !== "free" && (
                  <button
                    onClick={() =>
                      isCurrent
                        ? showToast(t("member.currentPlanLabel"), "info")
                        : hasPending
                        ? showToast(t("member.pendingUpgradeExists"), "info")
                        : handlePurchase(plan.code)
                    }
                    disabled={isPurchasing || hasPending}
                    className={`w-full py-3 rounded-xl text-sm font-semibold btn-press transition-all duration-200 disabled:opacity-50 ${
                      isCurrent
                        ? "bg-[#F5F5F5] text-[#BBBBBB]"
                        : hasPending
                        ? "bg-[#F5F5F5] text-[#BBBBBB]"
                        : "text-white shadow-lg"
                    }`}
                    style={
                      !isCurrent && !hasPending
                        ? { backgroundColor: plan.accentColor, boxShadow: `0 4px 14px ${plan.accentColor}40` }
                        : undefined
                    }
                  >
                    {isPurchasing ? t("member.redirectingPay") : isCurrent ? t("member.currentPlanLabel") : hasPending ? t("member.reviewing") : t("member.buyNow")}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* 底部说明 */}
        <p className="text-center text-xs text-[#CCCCCC] py-4">
          {t("member.purchaseAgreement")}
        </p>
      </div>

      {/* 支付弹窗 */}
      {showPayModal && payPlan && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm overflow-hidden animate-fade-in-up">
            {/* 头部 */}
            <div className="px-5 py-5 text-white relative" style={{ background: `linear-gradient(135deg, ${payPlan.accentColor}, ${payPlan.accentColor}CC)` }}>
              <button
                onClick={() => setShowPayModal(false)}
                className="absolute right-4 top-4 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-sm"
              >
                ✕
              </button>
              <p className="text-sm opacity-90">{t("member.upgradeTo")}{payPlan.name}</p>
              <p className="text-3xl font-black mt-1">
                ¥{payPlan.price}
                <span className="text-sm font-normal opacity-80">{t("member.perMonth")}</span>
              </p>
            </div>

            {isStripeMode ? (
              /* ── Stripe 模式：选择支付方式后跳转 ── */
              <div className="px-5 py-5">
                <p className="text-sm text-[#666666] mb-3">{t("member.selectPayMethod")}</p>
                <div className="space-y-2.5">
                  {/* 微信支付 */}
                  <button
                    onClick={() => setPayMethod("wechat")}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
                      payMethod === "wechat" ? "border-[#07C160] bg-[#07C160]/5" : "border-[#EEEEEE]"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-[#07C160]/10 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#07C160"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z"/></svg>
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium text-[#333333]">{t("member.wechatPay")}</p>
                      <p className="text-[11px] text-[#999999]">WeChat Pay</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      payMethod === "wechat" ? "border-[#07C160]" : "border-[#DDDDDD]"
                    }`}>
                      {payMethod === "wechat" && <div className="w-2.5 h-2.5 rounded-full bg-[#07C160]" />}
                    </div>
                  </button>

                  {/* 支付宝 */}
                  <button
                    onClick={() => setPayMethod("alipay")}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
                      payMethod === "alipay" ? "border-[#1677FF] bg-[#1677FF]/5" : "border-[#EEEEEE]"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-[#1677FF]/10 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1677FF"><path d="M21.422 15.358c-3.32-1.326-6.092-2.786-6.092-2.786s1.44-3.96.36-5.88c-1.08-1.92-3.84-1.56-3.84-1.56s-1.08-.12-2.16.72c-1.08.84-1.56 2.4-1.56 2.4s-.6 1.92.12 3.84c.72 1.92 2.64 2.64 2.64 2.64s-1.32 2.16-3.72 3.48C4.682 19.534 2.522 18.574.922 17.074c-1.2-1.14-.84-2.64-.84-2.64s.24-1.08 1.56-1.56c1.32-.48 2.16.6 2.16.6s.84 1.08.24 2.28c-.6 1.2-1.92 1.08-1.92 1.08s1.32 1.44 3.48.96c2.16-.48 3.6-2.28 3.6-2.28s-2.76-1.56-3.12-4.32c-.36-2.76 1.32-4.92 1.32-4.92S9.502 4.354 12.382 4.114c2.88-.24 4.56 1.68 4.56 1.68s1.56 1.92 1.2 4.44c-.36 2.52-2.28 4.08-2.28 4.08s2.64 1.2 5.52 2.16c0 0 .84.36.84 1.08 0 .72-.96.84-.96.84l.16-1.04z"/></svg>
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium text-[#333333]">{t("member.alipay")}</p>
                      <p className="text-[11px] text-[#999999]">Alipay</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      payMethod === "alipay" ? "border-[#1677FF]" : "border-[#DDDDDD]"
                    }`}>
                      {payMethod === "alipay" && <div className="w-2.5 h-2.5 rounded-full bg-[#1677FF]" />}
                    </div>
                  </button>

                  {/* 信用卡 */}
                  <button
                    onClick={() => setPayMethod("card")}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
                      payMethod === "card" ? "border-[#635BFF] bg-[#635BFF]/5" : "border-[#EEEEEE]"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-[#635BFF]/10 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#635BFF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                        <line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium text-[#333333]">{t("member.creditCard")}</p>
                      <p className="text-[11px] text-[#999999]">{t("member.visaMasterUnion")}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      payMethod === "card" ? "border-[#635BFF]" : "border-[#DDDDDD]"
                    }`}>
                      {payMethod === "card" && <div className="w-2.5 h-2.5 rounded-full bg-[#635BFF]" />}
                    </div>
                  </button>
                </div>

                <button
                  onClick={handleStripeCheckout}
                  disabled={purchasing === payPlan.code}
                  className="w-full mt-5 py-3.5 rounded-xl text-white text-sm font-semibold btn-press transition-all duration-200 disabled:opacity-50"
                  style={{
                    backgroundColor: payPlan.accentColor,
                    boxShadow: `0 4px 14px ${payPlan.accentColor}40`,
                  }}
                >
                  {purchasing === payPlan.code ? t("member.redirecting") : t("member.confirmPay")}
                </button>

                <p className="text-[11px] text-[#BBBBBB] mt-3 text-center">
                  {t("member.securePage")}
                </p>
              </div>
            ) : (
              /* ── 人工审核模式：收款码 + 我已支付 ── */
              <>
                {/* 支付方式切换 */}
                <div className="flex bg-[#FAFAFA]">
                  <button
                    onClick={() => setPayMethod("wechat")}
                    className={`flex-1 py-3.5 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                      payMethod === "wechat"
                        ? "text-[#07C160] bg-white border-b-2 border-[#07C160]"
                        : "text-[#999999]"
                    }`}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.062-6.122zM14.033 13.3c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982z"/></svg>
                    {t("member.wechatPay")}
                  </button>
                  <button
                    onClick={() => setPayMethod("alipay")}
                    className={`flex-1 py-3.5 text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                      payMethod === "alipay"
                        ? "text-[#1677FF] bg-white border-b-2 border-[#1677FF]"
                        : "text-[#999999]"
                    }`}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M21.422 15.358c-3.32-1.326-6.092-2.786-6.092-2.786s1.44-3.96.36-5.88c-1.08-1.92-3.84-1.56-3.84-1.56s-1.08-.12-2.16.72c-1.08.84-1.56 2.4-1.56 2.4s-.6 1.92.12 3.84c.72 1.92 2.64 2.64 2.64 2.64s-1.32 2.16-3.72 3.48C4.682 19.534 2.522 18.574.922 17.074c-1.2-1.14-.84-2.64-.84-2.64s.24-1.08 1.56-1.56c1.32-.48 2.16.6 2.16.6s.84 1.08.24 2.28c-.6 1.2-1.92 1.08-1.92 1.08s1.32 1.44 3.48.96c2.16-.48 3.6-2.28 3.6-2.28s-2.76-1.56-3.12-4.32c-.36-2.76 1.32-4.92 1.32-4.92S9.502 4.354 12.382 4.114c2.88-.24 4.56 1.68 4.56 1.68s1.56 1.92 1.2 4.44c-.36 2.52-2.28 4.08-2.28 4.08s2.64 1.2 5.52 2.16c0 0 .84.36.84 1.08 0 .72-.96.84-.96.84l.16-1.04z"/></svg>
                    {t("member.alipay")}
                  </button>
                </div>

                {/* 二维码区域 */}
                <div className="px-6 py-6 flex flex-col items-center">
                  {currentQrUrl ? (
                    <div className="w-44 h-44 bg-white rounded-xl flex items-center justify-center overflow-hidden shadow-inner border border-[#EEEEEE]">
                      <img
                        src={currentQrUrl}
                        alt={t(payMethod === "wechat" ? "member.wechatPayQr" : "member.alipayQr")}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-44 h-44 rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-[#DDDDDD] bg-[#FAFAFA]">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${payMethod === "wechat" ? "bg-[#07C160]/10" : "bg-[#1677FF]/10"}`}>
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill={payMethod === "wechat" ? "#07C160" : "#1677FF"}>
                          {payMethod === "wechat" ? (
                            <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z" />
                          ) : (
                            <path d="M21.422 15.358c-3.32-1.326-6.092-2.786-6.092-2.786s1.44-3.96.36-5.88c-1.08-1.92-3.84-1.56-3.84-1.56s-1.08-.12-2.16.72c-1.08.84-1.56 2.4-1.56 2.4s-.6 1.92.12 3.84c.72 1.92 2.64 2.64 2.64 2.64s-1.32 2.16-3.72 3.48C4.682 19.534 2.522 18.574.922 17.074c-1.2-1.14-.84-2.64-.84-2.64s.24-1.08 1.56-1.56c1.32-.48 2.16.6 2.16.6s.84 1.08.24 2.28c-.6 1.2-1.92 1.08-1.92 1.08s1.32 1.44 3.48.96c2.16-.48 3.6-2.28 3.6-2.28s-2.76-1.56-3.12-4.32c-.36-2.76 1.32-4.92 1.32-4.92S9.502 4.354 12.382 4.114c2.88-.24 4.56 1.68 4.56 1.68s1.56 1.92 1.2 4.44c-.36 2.52-2.28 4.08-2.28 4.08s2.64 1.2 5.52 2.16c0 0 .84.36.84 1.08 0 .72-.96.84-.96.84l.16-1.04z" />
                          )}
                        </svg>
                      </div>
                      <span className="text-sm text-[#666666] font-medium">{t("member.scanToPay")}</span>
                      <span className="text-lg font-bold mt-1" style={{ color: payMethod === "wechat" ? "#07C160" : "#1677FF" }}>
                        ¥{payPlan.price}.00
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-[#999999] mt-3 text-center leading-relaxed">
                    {t(payMethod === "wechat" ? "member.scanWechat" : "member.scanAlipay")}
                  </p>

                  {/* 我已支付按钮 */}
                  <button
                    onClick={handleConfirmPay}
                    disabled={confirming}
                    className="w-full mt-5 py-3.5 rounded-xl text-white text-sm font-semibold btn-press transition-all duration-200 disabled:opacity-50"
                    style={{
                      backgroundColor: payMethod === "wechat" ? "#07C160" : "#1677FF",
                      boxShadow: `0 4px 14px ${payMethod === "wechat" ? "#07C16040" : "#1677FF40"}`,
                    }}
                  >
                    {confirming ? t("member.submitting") : t("member.iHavePaid")}
                  </button>

                  <p className="text-[11px] text-[#BBBBBB] mt-3 text-center leading-relaxed">
                    {t("member.adminWillConfirm")}<br />
                    {t("member.adminOpenPlan")}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
