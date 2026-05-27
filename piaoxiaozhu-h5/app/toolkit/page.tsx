"use client";

import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";

const tools = [
  { icon: "🧾", title: "票据识别", desc: "AI自动识别发票、收据、小票", href: "/upload" },
  { icon: "📊", title: "智能分类", desc: "5层分类引擎自动归类", href: null },
  { icon: "📈", title: "利润报表", desc: "实时生成收支与毛利分析", href: null },
  { icon: "💾", title: "数据导出", desc: "一键导出CSV格式数据", href: "/report" },
  { icon: "🔒", title: "数据安全", desc: "端到端加密保护隐私", href: null },
  { icon: "☁️", title: "云端同步", desc: "多设备数据实时同步", href: null },
];

export default function ToolkitPage() {
  const router = useRouter();

  return (
    <div className="pb-16">
      <PageHeader title="工具箱" />

      <div className="px-4 -mt-4 space-y-3">
        {tools.map((tool, i) => {
          const clickable = tool.href !== null;
          const Wrapper = clickable ? "button" : "div";
          return (
            <Wrapper
              key={tool.title}
              {...(clickable
                ? {
                    onClick: () => router.push(tool.href!),
                    className: `w-full bg-white rounded-md p-4 shadow-card flex items-center gap-4 animate-fade-in-up stagger-${Math.min(i + 1, 6)} card-press text-left`,
                  }
                : {
                    className: `bg-white rounded-md p-4 shadow-card flex items-center gap-4 animate-fade-in-up stagger-${Math.min(i + 1, 6)}`,
                  })}
            >
              <span className="text-2xl">{tool.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-[#333333]">{tool.title}</p>
                <p className="text-xs text-[#999999] mt-0.5">{tool.desc}</p>
              </div>
              {clickable && (
                <svg viewBox="0 0 24 24" fill="none" stroke="#CCCCCC" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
}
