import PageHeader from "@/components/page-header";

const tools = [
  { icon: "🧾", title: "票据识别", desc: "AI自动识别发票、收据、小票" },
  { icon: "📊", title: "智能分类", desc: "5层分类引擎自动归类" },
  { icon: "📈", title: "利润报表", desc: "实时生成收支与毛利分析" },
  { icon: "💾", title: "数据导出", desc: "一键导出CSV格式数据" },
  { icon: "🔒", title: "数据安全", desc: "端到端加密保护隐私" },
  { icon: "☁️", title: "云端同步", desc: "多设备数据实时同步" },
];

export default function ToolkitPage() {
  return (
    <div className="pb-16">
      <PageHeader title="工具箱" />

      <div className="px-4 -mt-4 space-y-3">
        {tools.map((tool, i) => (
          <div
            key={tool.title}
            className={`bg-white rounded-md p-4 shadow-card flex items-center gap-4 animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}
          >
            <span className="text-2xl">{tool.icon}</span>
            <div>
              <p className="font-medium text-sm text-[#333333]">{tool.title}</p>
              <p className="text-xs text-[#999999] mt-0.5">{tool.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
