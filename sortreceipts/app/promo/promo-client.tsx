"use client";

import { useState } from "react";

import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";
import { formatPrice } from "@/lib/currency";

/**
 * 推广页。
 *
 * ## 与中文版的差异，以及为什么
 *
 * 1. **删掉了「用户评价」**。原来那两条带五星、带具体价格故事的署名评价是编的。
 *    美国 FTC 2024 年生效的虚假评价规则可以对这类内容开民事罚款，欧盟 Omnibus
 *    指令同样禁止。海外版不能有。改成「适合哪些店」的事实性描述——同样有说服力，
 *    但不需要编人。
 *
 * 2. **微信分享换成系统分享 + 复制链接**。欧美用户没有微信。`navigator.share`
 *    会调起 iOS/Android 原生面板，覆盖 iMessage、WhatsApp、邮件。
 *
 * 3. **价格走 formatPrice**，随站点币种显示。中文文案保留「省 90%」式的表达，
 *    英文改为具体金额对比——欧美用户对绝对数字更敏感。
 */

const FEATURE_KEYS = [
  { key: "capture", icon: "camera" },
  { key: "report", icon: "doc" },
  { key: "insight", icon: "pulse" },
  { key: "privacy", icon: "shield" },
] as const;

const COMPARE_KEYS = ["price", "entry", "report", "insight", "access"] as const;
const FIT_KEYS = ["restaurant", "cafe", "foodtruck", "retail"] as const;

function FeatureIcon({ name }: { name: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "w-6 h-6",
  };

  if (name === "camera") {
    return (
      <svg {...common}>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    );
  }
  if (name === "doc") {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  }
  if (name === "pulse") {
    return (
      <svg {...common}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export default function PromoClient({ userId }: { userId: string | null }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/promo${userId ? `?ref=${userId}` : ""}`
      : "";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast(t("promo.copied"), "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(t("promo.copyFailed"), "error");
    }
  }

  /**
   * 系统分享。移动端调起原生面板；桌面端多数浏览器不支持 `navigator.share`，
   * 此时直接退回复制链接——不给用户一个点了没反应的按钮。
   */
  async function handleShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: t("promo.brand"),
          text: t("promo.shareText"),
          url: shareUrl,
        });
        return;
      } catch {
        // 用户取消分享不算失败，静默返回
        return;
      }
    }
    await handleCopy();
  }

  return (
    <div className="mx-auto w-full max-w-mobile min-h-screen bg-gradient-to-b from-[#2563EB] via-[#60A5FA] to-[#FFA07A]">
      {/* 品牌区 */}
      <div className="pt-14 pb-8 px-6 text-center text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-white.svg" alt="" width={64} height={64} className="mb-4" />
        <h1 className="text-3xl font-black tracking-tight">{t("promo.brand")}</h1>
        <p className="text-white/90 text-base mt-2 font-medium">{t("promo.tagline")}</p>
        <p className="text-white/70 text-sm mt-1">{t("promo.subtitle")}</p>
      </div>

      <div className="mx-4">
        {/* 四项能力 */}
        <div className="bg-white rounded-2xl p-5 shadow-xl mb-4">
          <h2 className="text-lg font-bold text-[#0F172A] mb-4 text-center">{t("promo.sectionTitle")}</h2>
          <div className="grid grid-cols-2 gap-4">
            {FEATURE_KEYS.map((f) => (
              <div key={f.key} className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-xl bg-[#2563EB]/10 flex items-center justify-center text-[#2563EB] mb-2">
                  <FeatureIcon name={f.icon} />
                </div>
                <p className="text-sm font-semibold text-[#0F172A]">{t(`promo.f.${f.key}.title`)}</p>
                <p className="text-[11px] text-[#64748B] mt-0.5 leading-tight">{t(`promo.f.${f.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 价格对比 */}
        <div className="bg-white rounded-2xl p-5 shadow-xl mb-4">
          <h2 className="text-lg font-bold text-[#0F172A] mb-1 text-center">{t("promo.compareTitle")}</h2>
          <p className="text-xs text-[#64748B] text-center mb-4">{t("promo.compareSubtitle")}</p>
          <div className="space-y-3">
            {COMPARE_KEYS.map((k) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-sm text-[#475569] w-20">{t(`promo.cmp.${k}.item`)}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 bg-[#2563EB]/8 rounded-lg px-2 py-2 text-center">
                    <span className="text-xs font-semibold text-[#2563EB]">{t(`promo.cmp.${k}.us`)}</span>
                  </div>
                  <span className="text-[10px] text-[#CBD5E1]">vs</span>
                  <div className="flex-1 bg-[#F8FAFC] rounded-lg px-2 py-2 text-center">
                    <span className="text-xs text-[#94A3B8]">{t(`promo.cmp.${k}.them`)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 套餐 */}
        <div className="bg-white rounded-2xl p-5 shadow-xl mb-4">
          <h2 className="text-lg font-bold text-[#0F172A] mb-4 text-center">{t("promo.plansTitle")}</h2>
          <div className="space-y-3">
            <div className="border border-[#E2E8F0] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-[#0F172A]">{t("promo.planFree")}</span>
                  <span className="text-[11px] text-[#64748B] ml-2">{t("promo.planFreeNote")}</span>
                </div>
                <span className="text-lg font-black text-[#64748B]">{formatPrice(0, 0)}</span>
              </div>
              <p className="text-[11px] text-[#94A3B8] mt-1">{t("promo.planFreeSpec")}</p>
            </div>

            <div className="border-2 border-[#2563EB] rounded-xl p-4 relative bg-[#2563EB]/3">
              <div className="absolute -top-2.5 right-3 bg-[#2563EB] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                {t("promo.popular")}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-[#0F172A]">{t("promo.planPro")}</span>
                  <span className="text-[11px] text-[#2563EB] ml-2">{t("promo.recommended")}</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-black text-[#2563EB]">{formatPrice(29, 3.99)}</span>
                  <span className="text-[11px] text-[#64748B]">{t("promo.perMonth")}</span>
                </div>
              </div>
              <p className="text-[11px] text-[#475569] mt-1">{t("promo.planProSpec")}</p>
            </div>

            <div className="border border-[#E2E8F0] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-[#0F172A]">{t("promo.planEnterprise")}</span>
                  <span className="text-[11px] text-[#64748B] ml-2">{t("promo.planEnterpriseNote")}</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-black text-[#722ED1]">{formatPrice(99, 13.99)}</span>
                  <span className="text-[11px] text-[#64748B]">{t("promo.perMonth")}</span>
                </div>
              </div>
              <p className="text-[11px] text-[#475569] mt-1">{t("promo.planEnterpriseSpec")}</p>
            </div>
          </div>
        </div>

        {/* 适合谁：事实性描述，替代原来编造的用户评价 */}
        <div className="bg-white rounded-2xl p-5 shadow-xl mb-4">
          <h2 className="text-lg font-bold text-[#0F172A] mb-3 text-center">{t("promo.fitTitle")}</h2>
          <ul className="space-y-2">
            {FIT_KEYS.map((k) => (
              <li key={k} className="flex items-start gap-2">
                <span className="text-[#2563EB] mt-0.5">·</span>
                <span className="text-xs text-[#475569] leading-relaxed">{t(`promo.fit.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="mt-6 mb-8 px-2">
          <a
            href="/auth/login"
            className="block w-full py-4 rounded-2xl text-white text-base font-bold text-center btn-press shadow-lg"
            style={{
              background: "linear-gradient(135deg, #2563EB, #60A5FA)",
              boxShadow: "0 6px 20px rgba(37,99,235,0.4)",
            }}
          >
            {t("promo.cta")}
          </a>
          <p className="text-center text-[11px] text-white/70 mt-3">{t("promo.ctaNote")}</p>
        </div>

        {/* 分享 */}
        <div className="bg-white/95 backdrop-blur rounded-2xl p-5 shadow-xl mb-8">
          <h3 className="text-sm font-bold text-[#0F172A] text-center mb-3">{t("promo.shareTitle")}</h3>
          <div className="flex gap-3">
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#2563EB] text-white text-sm font-medium btn-press"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              {t("promo.share")}
            </button>
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#F8FAFC] text-[#0F172A] text-sm font-medium btn-press"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? t("promo.copiedShort") : t("promo.copyLink")}
            </button>
          </div>
        </div>
      </div>

      <div className="text-center pb-10 px-6">
        <p className="text-white/60 text-[11px]">{t("promo.footer")}</p>
      </div>
    </div>
  );
}
