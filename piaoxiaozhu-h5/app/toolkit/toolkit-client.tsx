"use client";

import { useState } from "react";
import PageHeader from "@/components/page-header";
import TabBar from "@/components/tab-bar";
import { useI18n } from "@/lib/i18n";

interface ContentItem {
  id: string;
  titleKey: string;
  contentKey: string;
  categoryKey: string;
}

const TOOLKIT_ITEMS: ContentItem[] = [
  { id: "tax-1", titleKey: "toolkit.vatRate", contentKey: "toolkit.vatRateContent", categoryKey: "toolkit.taxPolicy" },
  { id: "tax-2", titleKey: "toolkit.citRate", contentKey: "toolkit.citRateContent", categoryKey: "toolkit.taxPolicy" },
  { id: "tax-3", titleKey: "toolkit.smeBenefit", contentKey: "toolkit.smeBenefitContent", categoryKey: "toolkit.taxPolicy" },
  { id: "tax-4", titleKey: "toolkit.pitRate", contentKey: "toolkit.pitRateContent", categoryKey: "toolkit.taxPolicy" },
  { id: "invoice-1", titleKey: "toolkit.invoiceProcess", contentKey: "toolkit.invoiceProcessContent", categoryKey: "toolkit.invoiceGuide" },
  { id: "invoice-2", titleKey: "toolkit.redInvoice", contentKey: "toolkit.redInvoiceContent", categoryKey: "toolkit.invoiceGuide" },
  { id: "invoice-3", titleKey: "toolkit.invoiceVerify", contentKey: "toolkit.invoiceVerifyContent", categoryKey: "toolkit.invoiceGuide" },
  { id: "invoice-4", titleKey: "toolkit.eInvoice", contentKey: "toolkit.eInvoiceContent", categoryKey: "toolkit.invoiceGuide" },
];

const TOOLKIT_CATEGORIES = ["toolkit.taxPolicy", "toolkit.invoiceGuide"];

export default function ToolkitClient() {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState(TOOLKIT_CATEGORIES[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredContents = TOOLKIT_ITEMS.filter(
    (i) => i.categoryKey === activeCategory
  );

  return (
    <div className="pb-16 min-h-screen bg-[#F5F5F5]">
      <PageHeader title={t("toolkit.title")} showBack />
      <div className="px-4 pt-1 space-y-3">
        <p className="text-xs text-[#999999] animate-fade-in">
          {t("toolkit.subtitle")}
        </p>

        {/* 分类标签 */}
        <div className="flex gap-2 animate-fade-in-up">
          {TOOLKIT_CATEGORIES.map((cat) => (
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
              {t(cat)}
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
                    {t(item.titleKey)}
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
                      {t(item.contentKey).split("\n").map((line, i) => (
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
