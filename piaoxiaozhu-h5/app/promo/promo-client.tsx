"use client";

import { useState, useRef } from "react";
import { useToast } from "@/components/toast";

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
    title: "拍照识票",
    desc: "3秒识别发票信息，无需手动录入",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: "自动报表",
    desc: "收支分类、月度趋势，一目了然",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "AI 经营分析",
    desc: "智能诊断经营问题，给出优化建议",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "数据安全",
    desc: "银行级加密存储，数据永不丢失",
  },
];

const COMPARE = [
  { item: "月费", us: "¥29", them: "¥300-500" },
  { item: "录入方式", us: "AI拍照识别", them: "手动录入" },
  { item: "出报表", us: "实时自动", them: "次月才给" },
  { item: "经营分析", us: "AI智能分析", them: "基本没有" },
  { item: "随时查看", us: "手机随时看", them: "要等会计发" },
];

export default function PromoClient({ userId }: { userId: string | null }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/promo${userId ? `?ref=${userId}` : ""}`
    : "";

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast("链接已复制，快去分享吧", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("复制失败，请手动复制", "error");
    }
  }

  function handleShareWechat() {
    showToast("链接已复制，打开微信发送给好友", "success");
    navigator.clipboard.writeText(shareUrl).catch(() => {});
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FF6B35] via-[#FF8F65] to-[#FFA07A]">
      {/* 顶部品牌区 */}
      <div className="pt-14 pb-8 px-6 text-center text-white">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm mb-4 shadow-lg">
          <svg viewBox="0 0 24 24" fill="none" className="w-9 h-9 text-white">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth={1.8} />
            <path d="M7 8h10M7 12h6M7 16h8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-3xl font-black tracking-tight">票小助</h1>
        <p className="text-white/90 text-base mt-2 font-medium">拍照识票 · 自动记账 · AI 经营分析</p>
        <p className="text-white/70 text-sm mt-1">小商户的 AI 记账神器</p>
      </div>

      {/* 主卡片区域 */}
      <div ref={posterRef} className="mx-4">
        {/* 核心卖点 */}
        <div className="bg-white rounded-2xl p-5 shadow-xl mb-4">
          <h2 className="text-lg font-bold text-[#333333] mb-4 text-center">告别手动记账</h2>
          <div className="grid grid-cols-2 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-xl bg-[#FF6B35]/10 flex items-center justify-center text-[#FF6B35] mb-2">
                  {f.icon}
                </div>
                <p className="text-sm font-semibold text-[#333333]">{f.title}</p>
                <p className="text-[11px] text-[#999999] mt-0.5 leading-tight">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 价格对比 */}
        <div className="bg-white rounded-2xl p-5 shadow-xl mb-4">
          <h2 className="text-lg font-bold text-[#333333] mb-1 text-center">比代记账省 90%</h2>
          <p className="text-xs text-[#999999] text-center mb-4">同样专业，价格只要 1/10</p>
          <div className="space-y-3">
            {COMPARE.map((c) => (
              <div key={c.item} className="flex items-center justify-between">
                <span className="text-sm text-[#666666] w-16">{c.item}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 bg-[#FF6B35]/8 rounded-lg px-3 py-2 text-center">
                    <span className="text-sm font-semibold text-[#FF6B35]">{c.us}</span>
                  </div>
                  <span className="text-[10px] text-[#CCCCCC]">vs</span>
                  <div className="flex-1 bg-[#F5F5F5] rounded-lg px-3 py-2 text-center">
                    <span className="text-sm text-[#BBBBBB] line-through">{c.them}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 套餐卡片 */}
        <div className="bg-white rounded-2xl p-5 shadow-xl mb-4">
          <h2 className="text-lg font-bold text-[#333333] mb-4 text-center">选择套餐</h2>
          <div className="space-y-3">
            {/* 免费版 */}
            <div className="border border-[#EEEEEE] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-[#333333]">免费版</span>
                  <span className="text-[11px] text-[#999999] ml-2">体验记账</span>
                </div>
                <span className="text-lg font-black text-[#999999]">¥0</span>
              </div>
              <p className="text-[11px] text-[#BBBBBB] mt-1">5张/月发票 · 1个项目 · 基础报表</p>
            </div>

            {/* 专业版 */}
            <div className="border-2 border-[#FF6B35] rounded-xl p-4 relative bg-[#FF6B35]/3">
              <div className="absolute -top-2.5 right-3 bg-[#FF6B35] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                最受欢迎
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-[#333333]">专业版</span>
                  <span className="text-[11px] text-[#FF6B35] ml-2">推荐</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-black text-[#FF6B35]">¥29</span>
                  <span className="text-[11px] text-[#999999]">/月</span>
                </div>
              </div>
              <p className="text-[11px] text-[#666666] mt-1">200张/月发票 · 10个项目 · AI分析 · 数据导出</p>
            </div>

            {/* 企业版 */}
            <div className="border border-[#EEEEEE] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-[#333333]">企业版</span>
                  <span className="text-[11px] text-[#999999] ml-2">全功能</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-black text-[#722ED1]">¥99</span>
                  <span className="text-[11px] text-[#999999]">/月</span>
                </div>
              </div>
              <p className="text-[11px] text-[#666666] mt-1">无限发票 · 无限项目 · 无限AI · 专属顾问</p>
            </div>
          </div>
        </div>

        {/* 用户评价 */}
        <div className="bg-white rounded-2xl p-5 shadow-xl mb-4">
          <h2 className="text-lg font-bold text-[#333333] mb-4 text-center">用户怎么说</h2>
          <div className="space-y-3">
            <div className="bg-[#FAFAFA] rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-full bg-[#FF6B35]/20 flex items-center justify-center text-[11px] font-bold text-[#FF6B35]">张</div>
                <span className="text-xs font-medium text-[#333333]">张老板 · 餐饮店</span>
                <div className="flex gap-0.5 ml-auto">
                  {[1,2,3,4,5].map(i => <span key={i} className="text-[10px] text-[#FF6B35]">★</span>)}
                </div>
              </div>
              <p className="text-xs text-[#666666] leading-relaxed">以前每月花 300 请代账，现在 29 块自己搞定，拍照就能记账，AI 还帮我分析哪天生意最好</p>
            </div>
            <div className="bg-[#FAFAFA] rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-full bg-[#722ED1]/20 flex items-center justify-center text-[11px] font-bold text-[#722ED1]">李</div>
                <span className="text-xs font-medium text-[#333333]">李姐 · 便利店</span>
                <div className="flex gap-0.5 ml-auto">
                  {[1,2,3,4,5].map(i => <span key={i} className="text-[10px] text-[#FF6B35]">★</span>)}
                </div>
              </div>
              <p className="text-xs text-[#666666] leading-relaxed">发票堆成山，现在拍一张就录好了，月底报表自动生成，再也不用手动算账</p>
            </div>
          </div>
        </div>

        {/* CTA 按钮 */}
        <div className="mt-6 mb-8 px-2">
          <a
            href="/auth/login"
            className="block w-full py-4 rounded-2xl text-white text-base font-bold text-center btn-press shadow-lg"
            style={{
              background: "linear-gradient(135deg, #FF6B35, #FF8F65)",
              boxShadow: "0 6px 20px rgba(255,107,53,0.4)",
            }}
          >
            免费体验，拍照记账
          </a>
          <p className="text-center text-[11px] text-white/60 mt-3">无需信用卡 · 5张发票免费体验 · 随时可取消</p>
        </div>

        {/* 分享区域 */}
        <div className="bg-white/95 backdrop-blur rounded-2xl p-5 shadow-xl mb-8">
          <h3 className="text-sm font-bold text-[#333333] text-center mb-3">分享给朋友</h3>
          <div className="flex gap-3">
            <button
              onClick={handleShareWechat}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#07C160] text-white text-sm font-medium btn-press"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18z"/></svg>
              微信好友
            </button>
            <button
              onClick={handleCopyLink}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#F5F5F5] text-[#333333] text-sm font-medium btn-press"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? "已复制" : "复制链接"}
            </button>
          </div>
        </div>
      </div>

      {/* 底部 */}
      <div className="text-center pb-10 px-6">
        <p className="text-white/50 text-[11px]">票小助 · 让每一张发票都有价值</p>
      </div>
    </div>
  );
}
