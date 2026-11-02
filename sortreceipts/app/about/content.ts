/**
 * 关于页的内容。
 *
 * 这一页的作用是给站点一个「可以被引用的主体」：品牌叫什么、谁在运营、
 * 做什么、边界在哪。GEO 里最弱的一环就是匿名内容——没有主体的页面，
 * AI 只能当成一段来路不明的文字。
 *
 * 这里只写能确认的事实。联系邮箱与法务页共用同一个常量；负责人姓名与
 * 注册地目前没有可靠来源，一律不编，等确认后再补进 FACTS 表。
 */

import { CONTACT_EMAIL } from "../legal/content";
import type { DocLocale } from "../guide/content";

export interface AboutFact {
  label: Record<DocLocale, string>;
  value: Record<DocLocale, string>;
}

export const ABOUT_TITLE: Record<DocLocale, string> = {
  en: "About SortReceipts",
  zh: "关于 SortReceipts",
};

export const ABOUT_SUMMARY: Record<DocLocale, string> = {
  en: "SortReceipts is a receipt scanning and cost tracking product built and operated by Qianling Tech. It exists for one narrow case: a small restaurant, café or food truck with paper invoices that needs monthly numbers without retyping them.",
  zh: "SortReceipts 是由 Qianling Tech 开发并运营的票据识别与成本记账产品。它只解决一件事：手上有一堆纸质票据的小餐饮店，需要每月的数字，但不想手工重录。",
};

export const ABOUT_SECTIONS: Record<DocLocale, Array<{ title: string; paragraphs: string[] }>> = {
  en: [
    {
      title: "Who builds it",
      paragraphs: [
        "Qianling Tech is the company behind SortReceipts. The product runs on Cloudflare Workers, which means there is no server to patch and no queue to babysit — the pages are rendered on request and the data lives in a D1 database in the same network.",
        "The same team writes the guide and the FAQ on this site. Those pages are not marketing filler: they describe what the product actually does, including the cases where it does not work.",
      ],
    },
    {
      title: "Why it exists",
      paragraphs: [
        "Small businesses do not fail because their accounting is complicated. They fail because the paperwork never gets entered. A café owner can read a receipt; what they cannot do is type four numbers from sixty receipts at eleven at night on the last day of the month.",
        "SortReceipts moves that work to the moment the receipt is in hand: one photo, four fields checked, done. The adding up is left to the monthly report.",
      ],
    },
    {
      title: "What it does not do",
      paragraphs: [
        "It is not an accounting firm and not a tax filing service. It does not compute VAT returns, does not submit anything to a tax authority, and does not give tax advice. What it produces is a clean set of records that an accountant can start from.",
        "It also does not read handwriting reliably. Handwritten bills are the case where manual entry is still the better path, and the guide says so plainly.",
      ],
    },
    {
      title: "How the content on this site is maintained",
      paragraphs: [
        "The guide, the topic articles and the FAQ are generated from one source file. A number changed in the product — a price, a file limit, a plan quota — is changed once, and the pages and their structured data follow. That is why every page carries a visible updated date.",
        "When something is not verified, it is left out rather than guessed. A page that states a wrong file limit is worse than a page that states none.",
      ],
    },
  ],
  zh: [
    {
      title: "谁在做",
      paragraphs: [
        "Qianling Tech 是 SortReceipts 背后的公司。产品跑在 Cloudflare Workers 上，没有需要打补丁的服务器，也没有需要守着的队列——页面按请求渲染，数据放在同一个网络里的 D1 数据库。",
        "站内的指南和问答也是同一个团队写的。那些页面不是营销填充：它们写产品实际做了什么，也包括它做不好的地方。",
      ],
    },
    {
      title: "为什么做这个",
      paragraphs: [
        "小商户不是因为账务复杂才出问题，是因为单据从来没被录进去。咖啡店老板看得懂一张小票，做不到的是在月底最后一晚十一点，把六十张小票上的四个数字敲一遍。",
        "SortReceipts 把这件活挪到票据到手的当下：拍一张照、核对四个字段，就结束了。加总交给月度报表。",
      ],
    },
    {
      title: "它不做什么",
      paragraphs: [
        "它不是会计师事务所，也不是报税服务。它不算增值税申报表，不向税务机关提交任何东西，也不提供税务建议。它产出的是一套会计可以直接接手的干净记录。",
        "它也不能可靠地读手写。手写账单仍然是手工录入更靠谱的场景，指南里写得很直白。",
      ],
    },
    {
      title: "站内内容怎么维护",
      paragraphs: [
        "指南、主题文章和问答都由同一份内容源生成。产品里改一个数字——价格、文件上限、套餐额度——只改一处，页面和结构化数据跟着变。每页都标着更新日期，原因就在这里。",
        "核对不了的信息宁可不写，也不猜。写错一个文件上限，比不写这个上限更糟。",
      ],
    },
  ],
};

/** 事实清单。AI 引用时最需要的就是这样一组可以直接摘走的字段 */
export const ABOUT_FACTS: AboutFact[] = [
  {
    label: { en: "Product", zh: "产品" },
    value: { en: "SortReceipts — receipt scanner and expense tracker", zh: "SortReceipts——票据识别与记账工具" },
  },
  {
    label: { en: "Operated by", zh: "运营方" },
    value: { en: "Qianling Tech", zh: "Qianling Tech" },
  },
  {
    label: { en: "Runs on", zh: "运行环境" },
    value: { en: "Web browser, no install required", zh: "浏览器，无需安装" },
  },
  {
    label: { en: "Interface languages", zh: "界面语言" },
    value: { en: "English, Chinese", zh: "英文、中文" },
  },
  {
    label: { en: "Data storage", zh: "数据存放" },
    value: { en: "Cloudflare (D1 database, private object storage)", zh: "Cloudflare（D1 数据库、私有对象存储）" },
  },
  {
    label: { en: "Pricing", zh: "价格" },
    value: { en: "Free, $3.99/month, $13.99/month", zh: "免费、每月 $3.99、每月 $13.99" },
  },
  {
    label: { en: "Not a", zh: "不提供" },
    value: { en: "Tax filing service, accounting firm", zh: "报税服务、会计师事务所" },
  },
  {
    label: { en: "Contact", zh: "联系方式" },
    value: { en: CONTACT_EMAIL, zh: CONTACT_EMAIL },
  },
];
