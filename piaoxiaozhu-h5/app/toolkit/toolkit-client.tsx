"use client";

import { useState } from "react";
import PageHeader from "@/components/page-header";
import TabBar from "@/components/tab-bar";

interface ContentItem {
  id: string;
  title: string;
  content: string;
  category: string;
}

const TOOLKIT_CONTENTS: ContentItem[] = [
  {
    id: "tax-1",
    title: "增值税税率",
    content:
      "一般纳税人：13%（货物销售、修理修配等）、9%（交通运输、建筑、不动产租赁等）、6%（现代服务、生活服务等）\n小规模纳税人：3%（征收率），阶段性减按1%征收",
    category: "税收政策速查",
  },
  {
    id: "tax-2",
    title: "企业所得税税率",
    content:
      "法定税率：25%\n小型微利企业：实际税负5%（年应纳税所得额不超过300万元）\n高新技术企业：15%\n技术先进型服务企业：15%",
    category: "税收政策速查",
  },
  {
    id: "tax-3",
    title: "小微企业优惠",
    content:
      "小型微利企业条件：年度应纳税所得额不超过300万元、从业人数不超过300人、资产总额不超过5000万元\n增值税：月销售额10万元以下免征增值税\n附加税：增值税小规模纳税人减半征收六税两费",
    category: "税收政策速查",
  },
  {
    id: "tax-4",
    title: "个人所得税",
    content:
      "综合所得：3%-45%（七级超额累进税率）\n经营所得：5%-35%（五级超额累进税率）\n专项附加扣除：子女教育、继续教育、大病医疗、住房贷款利息、住房租金、赡养老人、3岁以下婴幼儿照护",
    category: "税收政策速查",
  },
  {
    id: "invoice-1",
    title: "开票流程",
    content:
      "1. 登录增值税发票开票软件\n2. 选择发票类型（增值税专用发票/普通发票）\n3. 填写购买方信息（名称、税号、地址电话、开户行及账号）\n4. 填写商品或服务信息（名称、规格型号、数量、单价、税率）\n5. 核对金额和税额\n6. 点击开具并打印",
    category: "发票操作指南",
  },
  {
    id: "invoice-2",
    title: "红字发票",
    content:
      "适用情形：销货退回、开票有误、应税服务中止等\n操作流程：\n1. 购买方已认证：由购买方填开《开具红字增值税专用发票信息表》\n2. 购买方未认证：由销售方填开信息表\n3. 主管税务机关审核通过后，销售方开具红字专用发票",
    category: "发票操作指南",
  },
  {
    id: "invoice-3",
    title: "发票查验",
    content:
      "查验渠道：\n1. 全国增值税发票查验平台（https://inv-veri.chinatax.gov.cn）\n2. 当地税务局官方APP\n3. 12366纳税服务热线\n查验要素：发票代码、发票号码、开票日期、开具金额（不含税）\n注意事项：当日开具的发票最快可于次日查验",
    category: "发票操作指南",
  },
  {
    id: "invoice-4",
    title: "电子发票",
    content:
      "全电发票：全面数字化的电子发票，无需领用UKey和纸质发票，通过电子发票服务平台开具\n法律效力：与纸质发票具有同等法律效力\n存储要求：电子发票原件需保存5年以上\n注意事项：接收方应验证发票真伪后再入账",
    category: "发票操作指南",
  },
];

const CATEGORIES = [...new Set(TOOLKIT_CONTENTS.map((i) => i.category))];

export default function ToolkitClient() {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredContents = TOOLKIT_CONTENTS.filter(
    (i) => i.category === activeCategory
  );

  return (
    <div className="pb-16 min-h-screen bg-[#F5F5F5]">
      <PageHeader title="工具箱" showBack />
      <div className="px-4 -mt-4 space-y-3">
        <p className="text-xs text-[#999999] animate-fade-in">
          实用财税知识速查
        </p>

        {/* 分类标签 */}
        <div className="flex gap-2 animate-fade-in-up">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                setExpandedId(null);
              }}
              className={`px-4 py-2 rounded-xl text-sm btn-press ${
                activeCategory === cat
                  ? "bg-brand text-white"
                  : "bg-white text-[#666666] shadow-card"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 内容列表 */}
        <div className="space-y-2">
          {filteredContents.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className="bg-white rounded-md shadow-card overflow-hidden animate-fade-in-up"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="w-full flex items-center justify-between p-3 text-left"
                >
                  <span className="text-sm font-medium text-[#333333]">
                    {item.title}
                  </span>
                  <span
                    className={`text-[#999999] transition-transform duration-200 ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  >
                    ▸
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 animate-fade-in">
                    <div className="bg-[#F8F8F8] rounded-lg p-3">
                      {item.content.split("\n").map((line, i) => (
                        <p
                          key={i}
                          className="text-xs text-[#666666] leading-relaxed"
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <TabBar />
    </div>
  );
}
