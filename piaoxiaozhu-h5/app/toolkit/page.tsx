import PageHeader from "@/components/page-header";
import TabBar from "@/components/tab-bar";

const TOOLKIT_ITEMS = [
  {
    title: "增值税发票知识",
    icon: "🧾",
    items: [
      "增值税专用发票可以抵扣进项税额",
      "增值税普通发票不能抵扣",
      "电子发票与纸质发票具有同等法律效力",
      "发票开具后需在认证期内完成认证",
    ],
  },
  {
    title: "餐饮行业税务要点",
    icon: "🍜",
    items: [
      "餐饮业一般纳税人税率6%",
      "食材采购可索取增值税专用发票抵扣",
      "外卖收入按餐饮服务缴纳增值税",
      "堂食与外卖税务处理方式相同",
    ],
  },
  {
    title: "发票操作指南",
    icon: "📋",
    items: [
      "开票前核实购买方信息",
      "确保发票内容与实际交易一致",
      "保管好发票存根以备查验",
      "电子发票建议及时下载保存",
    ],
  },
];

export default function ToolkitPage() {
  return (
    <div className="pb-16">
      <PageHeader title="工具箱" />

      <div className="px-4 -mt-4 space-y-4">
        {TOOLKIT_ITEMS.map((section) => (
          <div key={section.title} className="bg-white rounded-md p-4 shadow-card">
            <h3 className="text-base font-semibold text-[#333333] mb-3 flex items-center gap-2">
              <span>{section.icon}</span>
              {section.title}
            </h3>
            <ul className="space-y-2">
              {section.items.map((item, i) => (
                <li key={i} className="text-sm text-[#666666] flex items-start gap-2">
                  <span className="text-brand mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <TabBar />
    </div>
  );
}
