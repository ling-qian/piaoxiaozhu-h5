/**
 * 长文指南与常见问题的唯一内容源。
 *
 * `/guide`、`/zh/guide`、`/faq`、`/zh/faq` 以及 `llms-full.txt` 都从这里取文字。
 * 只有一处来源，页面上写的话和结构化数据里的话才不会各说各的——
 * AI 读到两套互相矛盾的说法，通常两边都不引用。
 *
 * 这里只写能被核对的事实：套餐数字来自后端 `plans.ts` 的免费版与专业版定义，
 * 文件上限来自上传接口的校验。没核对过的数字一律不写。
 */

export type DocLocale = "en" | "zh";

export const DOC_LOCALES: DocLocale[] = ["en", "zh"];

/** 内容改动时同步这一天，页面和 JSON-LD 的 dateModified 都用它 */
export const DOC_UPDATED = "2026-11-01";

export interface DocSection {
  title: string;
  /** 一句话直接回答，放在小节最前面 */
  lead?: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: { head: string[]; rows: string[][] };
}

export interface DocFaq {
  q: Record<DocLocale, string>;
  a: Record<DocLocale, string>;
}

export const GUIDE_TITLE: Record<DocLocale, string> = {
  en: "Receipts to Month-End for a Small Restaurant: A Practical Guide",
  zh: "小餐饮店从票据到月结实操指南：拍照、对账、看毛利",
};

export const GUIDE_SUMMARY: Record<DocLocale, string> = {
  en: "A working guide for a restaurant, café or food truck: how supplier invoices are read, which cost categories a small kitchen runs on, how to keep a routine through a busy week, and what to check before choosing a tool.",
  zh: "这份指南写给餐馆、咖啡店和餐车：供应商发票怎么识别、一家小店的成本分成哪几类、怎样把记账固定成扛得住忙周的习惯，以及选工具前要核对什么。",
};

export const GUIDE_SECTIONS: Record<DocLocale, DocSection[]> = {
  en: [
    {
      title: "The short answer",
      lead: "SortReceipts reads a photo of a printed supplier invoice, delivery slip or receipt, extracts the vendor, amount, date and tax, files it under one of 8 restaurant cost categories, and keeps monthly revenue, expenses, gross margin and profit totals current. It runs in a browser, so there is nothing to install.",
      paragraphs: [
        "The work it removes is the retyping step. A paper receipt already contains the four numbers a bookkeeping spreadsheet needs; typing them in is the only part a machine can do faster than a person.",
        "The work it does not remove is judgement. If a photo is blurry, if the receipt is handwritten, or if the same purchase was already recorded, the record still needs a human look.",
      ],
    },
    {
      title: "The small-restaurant template",
      lead: "Eight cost categories, no industry switch: the template is already set up for a kitchen.",
      paragraphs: [
        "A restaurant's costs do not look like a generic office's. The template keeps eight lines: food and ingredients, payroll, rent, utilities, platform fees, advertising, office supplies and other. A wholesaler's invoice goes to Food & ingredients; a delivery app's commission goes to Platform fees.",
        "The template is fixed rather than selectable. An industry switch multiplies the category lists a scan must choose from, and one wrong pick costs more than an extra line under Other. When a purchase fits none of the seven named lines, file it under Other and describe it in the note.",
      ],
      table: {
        head: ["Category", "What goes in"],
        rows: [
          ["Food & ingredients", "Produce, meat, dairy, dry goods, drinks, invoices from wholesalers and suppliers"],
          ["Payroll", "Wages, contractor and agency staff, payroll services"],
          ["Rent", "Shop rent, storage, lease payments"],
          ["Utilities", "Electricity, water, gas, internet, phone"],
          ["Platform fees", "Delivery app commission, card processing, marketplace fees"],
          ["Advertising", "Ads, flyers, promotions, social media boosts"],
          ["Office supplies", "Packaging, printing, cleaning consumables, stationery"],
          ["Other", "Anything that fits none of the lines above"],
        ],
      },
    },
    {
      title: "What a pile of paper receipts actually costs",
      lead: "The cost is not the receipts themselves. It is the month-end catch-up, the retyping, and the moment you cannot answer how much was spent on food.",
      paragraphs: [
        "Three failures repeat in small restaurants that keep paper: receipts accumulate until the last day of the month, the totals get retyped from a photo into a spreadsheet, and nobody can say which category is eating the margin until the numbers are already closed.",
        "Each of those is a data-entry problem, not an accounting problem. The accounting logic for a small restaurant is simple — revenue in, costs out, grouped by category. What is hard is getting every receipt into the ledger on the day it happens.",
      ],
    },
    {
      title: "How receipt scanning works",
      lead: "The pipeline has four steps, and knowing which step failed tells you what to fix.",
      paragraphs: [
        "Step one is capture. The file is uploaded and checked: images up to 15 MB, in JPG, PNG, WebP, HEIC or HEIF. A format the server cannot classify is rejected before it reaches the reader.",
        "Step two is optical character recognition. The image is converted to text. This is the step that fails on handwriting, on thermal paper that has faded, and on a photo taken at an angle under a warm lamp.",
        "Step three is field extraction. The text is searched for the four values a record needs: vendor name, total amount, invoice date, and tax amount. A receipt that never printed a tax line will come back with an empty tax field, which is normal.",
        "Step four is categorization and reporting. The record is filed under one of 8 restaurant cost categories, and the monthly report recalculates revenue, expenses, the category split and the profit trend.",
      ],
      bullets: [
        "Capture: upload and format check",
        "OCR: image to text",
        "Extraction: text to vendor, amount, date, tax",
        "Categorization: record to category and monthly totals",
      ],
    },
    {
      title: "What the scan reads well, and what it does not",
      lead: "Printed supplier invoices, delivery slips and café receipts are the reliable case. Handwritten notes and badly lit photos are the unreliable one.",
      paragraphs: [
        "A printed receipt has machine-printed digits at a consistent size, which is close to the best case for OCR. A handwritten invoice has none of that, and a photo taken in a dim storeroom has motion blur and low contrast on top.",
        "When a field comes back wrong, correct it on the record rather than re-shooting the photo. The correction is stored with the record, so the monthly report uses the corrected value.",
      ],
      bullets: [
        "Shoot straight down, not at an angle",
        "Let the flash fire, or move to brighter light",
        "Keep the whole receipt in frame, including the total line",
        "Avoid creases across the amount column",
      ],
    },
    {
      title: "How to choose a tool",
      lead: "Compare four options on the same three questions: who types the numbers, where the data lives, and what happens at month end.",
      table: {
        head: ["Approach", "Who types the numbers", "Month-end work", "Where records live"],
        rows: [
          ["Paper envelope + spreadsheet", "You, from the photo", "Hours of retyping", "A local file only you can open"],
          ["Accounting software", "You, into a form", "Reconcile what is missing", "Vendor cloud"],
          ["Generic OCR app", "You, after fixing layout", "Copy rows into a system", "Depends on the app"],
          ["Receipt scanner with reports", "The scanner, you check", "Export and review", "The product's cloud"],
        ],
      },
      paragraphs: [
        "The fourth column is the one people skip. A tool that stores records in a format you cannot export is a tool that locks the work in. CSV export is the minimum: Excel, Numbers and Google Sheets all open it without conversion.",
      ],
    },
    {
      title: "A routine that survives a busy month",
      lead: "One project, one folder, one minute per receipt is the whole system.",
      bullets: [
        "Create a project per store or per line of business. Separate books stay separate.",
        "Photograph the receipt when you get it, not at month end. The photo is the only thing that has to happen on the day.",
        "Check the four extracted fields in the same sitting. Correcting later means finding the paper again.",
        "At month end, read the report first and export second. The report tells you which category moved; the export is for whoever keeps the books.",
      ],
      paragraphs: [
        "The reason to shoot on the day is not discipline, it is memory. A receipt photographed three weeks later is often a receipt whose merchant name you no longer recognise, and a record with the wrong vendor is a record you will re-open at the end of the quarter.",
      ],
    },
    {
      title: "Cost, limits and what the free plan covers",
      lead: "The free plan is 5 receipts a month and 1 project. Paid plans start at $3.99 a month.",
      table: {
        head: ["Plan", "Price", "Receipts per month", "Projects", "Export"],
        rows: [
          ["Free", "$0", "5", "1", "No"],
          ["Pro", "$3.99 / month", "200", "10", "CSV"],
          ["Business", "$13.99 / month", "Unlimited", "Unlimited", "CSV"],
        ],
      },
      paragraphs: [
        "Five receipts a month is enough to test whether the scan reads your particular receipts. It is not enough to run a shop, which is the point: the free plan is a trial with a limit rather than a trial with a countdown.",
        "Pro also includes the AI business review, which reads the month's records and writes a short summary of where the money went. Business removes the receipt and project caps and adds priority support.",
      ],
    },
    {
      title: "Data, privacy and the limits of the tool",
      lead: "Records are stored on Cloudflare infrastructure, encrypted in transit, and can be deleted from the account. The tool is not a tax filing service.",
      paragraphs: [
        "SortReceipts stores amounts as entered and groups them by category. It does not compute VAT returns, does not file anything with a tax authority, and does not replace an accountant. What it produces is a clean set of records an accountant can start from.",
        "Deleting an account deletes the records with it. That is deliberate: a bookkeeping tool that keeps a copy after you leave is a liability, not a feature.",
      ],
    },
    {
      title: "Terms used in this guide",
      lead: "Six terms cover almost every conversation about receipt automation.",
      bullets: [
        "OCR (optical character recognition): converting an image of text into machine-readable text.",
        "Field extraction: pulling specific values — vendor, amount, date, tax — out of the recognised text.",
        "Categorization: assigning each record to one of the 8 fixed restaurant cost categories.",
        "Monthly report: the monthly view of revenue, expenses, category split and gross margin.",
        "CSV: a plain-text table format that spreadsheets open directly.",
        "Duplicate: the same purchase recorded twice, usually because a receipt was photographed and then entered by hand as well.",
      ],
    },
  ],
  zh: [
    {
      title: "一句话答案",
      lead: "SortReceipts 读一张打印的供应商发票、送货单或小票，取出商户、金额、日期和税额，归到 8 个餐饮成本分类里的一个，并让当月的营业额、支出、毛利和利润汇总保持最新。它在浏览器里运行，不用装应用。",
      paragraphs: [
        "它替掉的是重打一遍数字这一步。一张票据上本来就有记账需要的四个值，把它们敲进表格是机器唯一能明显快过人的环节。",
        "它替不掉的是判断。照片模糊、票据手写、或者同一笔消费已经录过，这几类仍然要人来核对。",
      ],
    },
    {
      title: "小餐饮店模板",
      lead: "八类成本，没有行业开关：模板已经按一家小店排好。",
      paragraphs: [
        "餐饮店的成本和通用办公室不一样。模板只留八栏：食材、工资、房租、水电燃气、平台服务费、广告推广、办公用品和其他。批发商的送货单进「食材」，外卖平台的扣点进「平台服务费」。",
        "模板是固定的，不做行业切换。行业开关会让识别时的候选分类成倍增加，选错一次的代价比多写一行「其他」高。确实不属于前七类的支出，归到「其他」，在备注里写清楚。",
      ],
      table: {
        head: ["分类", "收什么票"],
        rows: [
          ["食材", "蔬菜、肉禽、乳品、粮油、酒水，批发商和供应商开出的发票"],
          ["工资", "员工工资、临时工、劳务派遣、代发工资服务"],
          ["房租", "店面租金、仓库、租赁合同"],
          ["水电燃气", "电费、水费、燃气、网络、电话"],
          ["平台服务费", "外卖平台抽成、刷卡手续费、平台服务费"],
          ["广告推广", "广告投放、传单、活动物料、社媒推广"],
          ["办公用品", "包装耗材、打印、清洁用品、文具"],
          ["其他", "以上七类都放不下的支出"],
        ],
      },
    },
    {
      title: "一堆纸质小票的成本在哪里",
      lead: "成本不在小票本身，而在月底补录、重复敲数字，以及答不出「上个月食材花了多少」的那一刻。",
      paragraphs: [
        "保留纸质票据的小餐饮店，重复踩三个坑：小票攒到月底才处理；总额从照片抄进表格；等数字结完账，才发现某个分类把利润吃掉了。",
        "这三件事都属于数据录入问题，不是会计问题。一家小店的账务逻辑很简单——钱进、钱出、按分类归堆。难的是让每一张票据在发生当天就进入账本。",
      ],
    },
    {
      title: "票据识别是怎么工作的",
      lead: "整条链路分四步。知道哪一步失败，才知道该修什么。",
      paragraphs: [
        "第一步是采集。文件上传后先过格式校验：图片不超过 15MB，接受 JPG、PNG、WebP、HEIC、HEIF。服务端认不出类型的文件，在进入识别之前就被拦下。",
        "第二步是光学字符识别。图片被转成文字。手写、褪色的热敏纸、暖光灯下斜着拍的照片，都栽在这一步。",
        "第三步是字段提取。程序在文字里找记录需要的四个值：商户名、总金额、开票日期、税额。本来就没打印税额那一行的小票，税额字段会空着，这属于正常。",
        "第四步是分类和汇总。记录被归到 8 个餐饮成本分类之一，月度报表据此重算营业额、支出、分类占比和利润趋势。",
      ],
      bullets: [
        "采集：上传与格式校验",
        "识别：图片转文字",
        "提取：文字转商户、金额、日期、税额",
        "分类：记录进入分类与月度汇总",
      ],
    },
    {
      title: "识别读得准的部分，和读不准的部分",
      lead: "超市、咖啡馆、加油站的打印小票是可靠场景；手写票据和暗光照片是不可靠场景。",
      paragraphs: [
        "打印小票的数字是机打的、字号一致，这接近识别的最理想情况。手写发票两样都不占，再加上昏暗餐厅里的抖动和低对比度，出错概率成倍上升。",
        "字段读错时，改记录本身，不要重拍照片。修正结果和记录一起存下来，月度报表用的是修正后的值。",
      ],
      bullets: [
        "镜头正对票据，别斜着拍",
        "开闪光灯，或者挪到更亮的地方",
        "把整张票拍进画面，含合计那一行",
        "避开金额那一列的折痕",
      ],
    },
    {
      title: "怎么挑工具",
      lead: "把四个选项放在同三个问题上比：谁敲数字、数据存在哪、月底要做什么。",
      table: {
        head: ["做法", "谁敲数字", "月底的工作", "记录存在哪"],
        rows: [
          ["纸袋 + 表格", "你，照着照片抄", "几小时的补录", "只有你能打开的本地文件"],
          ["记账软件", "你，填表单", "对账找缺口", "厂商的云"],
          ["通用 OCR 工具", "你，先修版式", "把行抄进另一个系统", "看这个工具的设计"],
          ["带报表的票据识别工具", "工具识别，你核对", "导出并复核", "产品的云"],
        ],
      },
      paragraphs: [
        "第四列最常被忽略。把记录存成导不出的格式，等于把活儿锁死在工具里。CSV 导出是底线：Excel、Numbers、Google 表格都能直接打开，不用转换。",
      ],
    },
    {
      title: "让记账习惯扛得住忙月",
      lead: "一个项目、一个文件夹、一张票一分钟，整套系统就这么多。",
      bullets: [
        "每家门店、每条业务线建一个项目。账目分开，就一直是分开的。",
        "拿到小票当场拍照，别等月底。只有拍照这一下必须发生在当天。",
        "同一次坐下来核对四个字段。隔几天再改，就得回头找那张纸。",
        "月底先看报表，再导出。报表告诉你哪个分类动了，导出是给管账的人。",
      ],
      paragraphs: [
        "当场拍的理由不是自律，是记忆。三周后补拍的小票，商户名往往已经认不出来了；商户填错的记录，到季度末还要再开一次。",
      ],
    },
    {
      title: "价格、限制与免费版的范围",
      lead: "免费版每月 5 张、1 个项目；付费版从每月 $3.99 起。",
      table: {
        head: ["套餐", "价格", "每月识别", "项目数", "导出"],
        rows: [
          ["免费版", "$0", "5 张", "1 个", "不支持"],
          ["专业版", "每月 $3.99", "200 张", "10 个", "CSV"],
          ["商业版", "每月 $13.99", "不限", "不限", "CSV"],
        ],
      },
      paragraphs: [
        "每月 5 张够用来验证识别能不能读你手上的小票，不够撑起一家店。这是有意设计的：免费版是带额度的试用，不是带倒计时的试用。",
        "专业版还带 AI 经营分析，读当月的记录并写一段钱花在哪的短评。商业版放开识别与项目上限，并给优先支持。",
      ],
    },
    {
      title: "数据、隐私与工具边界",
      lead: "记录存放在 Cloudflare 的基础设施上，传输过程加密，可以从账户里删除。这个工具不是报税服务。",
      paragraphs: [
        "SortReceipts 按录入的数字保存金额并按分类归堆。它不算增值税申报表，不向税务机关提交任何东西，也不替代会计。它产出的是会计可以直接接手的一套干净记录。",
        "注销账户会连同记录一起删除。这一条是刻意的：记账工具在你离开后还留一份副本，那是负债，不是功能。",
      ],
    },
    {
      title: "术语表",
      lead: "关于票据自动化，六个词能覆盖绝大多数讨论。",
      bullets: [
        "OCR（光学字符识别）：把文字图片转成机器可读的文字。",
        "字段提取：从识别出的文字里取出商户、金额、日期、税额这些具体值。",
        "分类：把每条记录归到固定的 8 个餐饮成本分类里。",
        "月度报表：按月看营业额、支出、分类占比和毛利的视图。",
        "CSV：一种纯文本表格格式，电子表格软件能直接打开。",
        "重复票据：同一笔消费被记了两次，通常是因为拍了照，又手工录了一遍。",
      ],
    },
  ],
};

/**
 * 常见问题。
 *
 * 每条都要能指向产品里真实存在的行为。答不上来的问题不写进来——
 * 一个含糊的答案是 AI 最容易引用、也最容易传错的那种。
 */
export const FAQ_ITEMS: DocFaq[] = [
  {
    q: {
      en: "What is SortReceipts?",
      zh: "SortReceipts 是什么？",
    },
    a: {
      en: "SortReceipts is a browser-based receipt scanner and cost tracker for small restaurants, cafés and food trucks. It reads vendor, amount, date and tax from a photo of a supplier invoice or receipt, files the record under one of 8 restaurant cost categories, and keeps monthly revenue, expenses, gross margin and profit reports current.",
      zh: "SortReceipts 是给小餐饮店用的票据识别与记账工具，在浏览器里运行。它从供应商发票或小票的照片里读出商户、金额、日期和税额，把记录归到 8 个餐饮成本分类之一，并让营业额、支出、毛利和利润的月度报表保持最新。",
    },
  },
  {
    q: {
      en: "Is the template meant for restaurants only?",
      zh: "这套模板只适合餐饮店吗？",
    },
    a: {
      en: "Yes, the eight categories are a restaurant's cost structure. There is no industry switch on purpose: a longer list makes the scan choose between near-identical options and get more wrong. A business outside food service can still use it, but most of its purchases would land under Other.",
      zh: "是的，八个分类就是一家餐饮店的成本结构。不做行业开关是有意为之：候选分类越长，识别越容易在两个相近的选项之间选错。非餐饮的业务也能用，只是多数支出会落进「其他」。",
    },
  },
  {
    q: { en: "Do I need to install an app?", zh: "需要安装应用吗？" },
    a: {
      en: "No. It runs in the browser on any phone, tablet or computer. On a phone you can add it to the home screen, but the web version is the product, not a placeholder for an app.",
      zh: "不需要。它在手机、平板或电脑的浏览器里运行。手机上可以添加到主屏幕，但网页版本身就是产品，不是应用的过渡版本。",
    },
  },
  {
    q: { en: "How accurate is the receipt scanning?", zh: "票据识别有多准？" },
    a: {
      en: "Printed supplier invoices, delivery slips and receipt rolls read reliably. Handwritten bills, faded thermal paper and low-light photos are the cases that need checking. Every field can be corrected on the record, and the report uses the corrected value.",
      zh: "供应商发票、送货单和收银小票读得可靠。手写账单、褪色热敏纸、暗光照片属于需要核对的场景。每个字段都能在记录上修改，报表用的是修正后的值。",
    },
  },
  {
    q: {
      en: "Which file types and sizes can I upload?",
      zh: "支持哪些文件类型和大小？",
    },
    a: {
      en: "Images in JPG, PNG, WebP, HEIC and HEIF, up to 15 MB each. Files larger than that are rejected before anything is stored, so a rejected upload does not leave a copy behind.",
      zh: "JPG、PNG、WebP、HEIC、HEIF 图片，每张不超过 15MB。超过上限的文件在存储之前就被拒绝，不会在服务器上留下副本。",
    },
  },
  {
    q: { en: "How does automatic categorization work?", zh: "自动分类是怎么判断的？" },
    a: {
      en: "Each record is assigned to one of 8 fixed categories: Food & ingredients, Payroll, Rent, Utilities, Platform fees, Advertising, Office supplies, and Other. A wrong category can be changed on the record.",
      zh: "每条记录会归到 8 个固定分类之一：食材、工资、房租、水电燃气、平台服务费、广告推广、办公用品、其他。归类错了可以在记录上改。",
    },
  },
  {
    q: { en: "Can I edit a field the scan got wrong?", zh: "识别读错的字段能改吗？" },
    a: {
      en: "Yes. Amount, vendor, date, tax and category are all editable after the scan, and a corrected field is marked as manually corrected so you can see later which records were touched.",
      zh: "能改。金额、商户、日期、税额和分类在识别之后都可以修改，被改过的字段会标成人工修正，方便以后回头看哪些记录动过。",
    },
  },
  {
    q: { en: "Can I export my data?", zh: "数据能导出吗？" },
    a: {
      en: "Monthly reports export as CSV on the Pro and Business plans. Excel, Numbers and Google Sheets open the file directly. The free plan does not include export.",
      zh: "专业版和商业版可以把月度报表导出成 CSV，Excel、Numbers 和 Google 表格都能直接打开。免费版不含导出功能。",
    },
  },
  {
    q: {
      en: "Does it work for more than one store or business?",
      zh: "多家门店或业务线能一起用吗？",
    },
    a: {
      en: "Each project is one store or one line of business, with its own records and its own monthly report. The free plan allows one project, Pro allows 10, and Business is unlimited.",
      zh: "一个项目对应一家门店或一条业务线，有自己的记录和月度报表。免费版 1 个项目，专业版 10 个，商业版不限。",
    },
  },
  {
    q: { en: "Is my financial data safe?", zh: "财务数据安全吗？" },
    a: {
      en: "Records are stored on Cloudflare infrastructure and encrypted in transit. Files sit in a private object store and are read through short-lived signed links, not public URLs.",
      zh: "记录存放在 Cloudflare 的基础设施上，传输过程加密。文件放在私有对象存储里，通过短期有效的签名地址读取，而不是公开链接。",
    },
  },
  {
    q: { en: "Can I delete my data or my account?", zh: "能删除数据或注销账户吗？" },
    a: {
      en: "Yes. Records can be deleted individually, and deleting the account removes the records with it. There is no retained copy after deletion.",
      zh: "可以。记录可以逐条删除，注销账户会连同记录一起清除，删除之后不留副本。",
    },
  },
  {
    q: { en: "Does it file taxes or compute VAT?", zh: "它能报税或计算增值税吗？" },
    a: {
      en: "No. SortReceipts keeps records and produces reports. It is not a tax filing service and does not compute VAT returns. Its output is a clean starting point for an accountant.",
      zh: "不能。SortReceipts 负责记录和出报表，不是报税服务，也不计算增值税申报表。它产出的是会计可以直接接手的干净数据。",
    },
  },
  {
    q: { en: "What is the free plan limit?", zh: "免费版的额度是多少？" },
    a: {
      en: "5 receipts per month, 1 project, and basic reports. Export and the AI business review are paid features.",
      zh: "每月 5 张票、1 个项目、基础报表。导出和 AI 经营分析属于付费功能。",
    },
  },
  {
    q: {
      en: "How is the AI business review different from the monthly report?",
      zh: "AI 经营分析和月度报表有什么区别？",
    },
    a: {
      en: "The report shows the numbers: income, expenses, category split and profit trend. The AI business review reads the same records and writes a short description of what moved and what to look at, on the Pro and Business plans.",
      zh: "报表给的是数字：收入、支出、分类占比和利润趋势。AI 经营分析读同一批记录，写一段哪里变了、该看什么的短评，专业版和商业版可用。",
    },
  },
  {
    q: { en: "Can my accountant use the export?", zh: "会计能直接用导出的文件吗？" },
    a: {
      en: "Yes. The CSV opens in Excel, Numbers and Google Sheets with no conversion step, which is what most accountants ask for at the end of a month or quarter.",
      zh: "能。CSV 在 Excel、Numbers 和 Google 表格里直接打开，不用转换，这是多数会计在月底或季度末要的形式。",
    },
  },
  {
    q: { en: "Does it work on iPhone and Android?", zh: "iPhone 和安卓都能用吗？" },
    a: {
      en: "Yes, through the browser on both. Photos can be taken in the camera app or uploaded from the photo library.",
      zh: "都能，走浏览器。照片可以现拍，也可以从相册里选。",
    },
  },
  {
    q: { en: "Does it read handwritten receipts?", zh: "手写小票能识别吗？" },
    a: {
      en: "It can try, but expect to correct more fields. Handwriting has no consistent character shapes, so the reliable path for handwritten bills is to enter the four values manually.",
      zh: "会尝试，但要做好改更多字段的准备。手写没有一致的字符形状，手写账单更可靠的做法是手工录那四个值。",
    },
  },
  {
    q: { en: "Which languages does the interface support?", zh: "界面支持哪些语言？" },
    a: {
      en: "The product interface is available in English and Chinese. The marketing site also has pages in Spanish, Portuguese, French, German, Japanese and Korean.",
      zh: "产品界面支持英文和中文。营销页另有西班牙语、葡萄牙语、法语、德语、日语和韩语版本。",
    },
  },
  {
    q: { en: "How do I cancel a paid plan?", zh: "怎么取消付费套餐？" },
    a: {
      en: "Cancelling stops the next renewal; the plan stays active until the period you already paid for ends. Records stay accessible on the free plan limits afterwards.",
      zh: "取消后停止下一次续费，已经付过的那段时间照常可用。到期后按免费版的额度继续使用，记录不会消失。",
    },
  },
];

export function faqForDoc(locale: DocLocale): DocFaq[] {
  return FAQ_ITEMS;
}

/** 指南正文压成纯文本，供 llms-full.txt 使用 */
export function guidePlainText(locale: DocLocale): string {
  const sections = GUIDE_SECTIONS[locale];
  const lines: string[] = [GUIDE_TITLE[locale], "", GUIDE_SUMMARY[locale], ""];

  for (const s of sections) {
    lines.push(`## ${s.title}`, "");
    if (s.lead) lines.push(s.lead, "");
    for (const p of s.paragraphs ?? []) lines.push(p, "");
    for (const b of s.bullets ?? []) lines.push(`- ${b}`);
    if (s.bullets?.length) lines.push("");
    if (s.table) {
      lines.push(`| ${s.table.head.join(" | ")} |`);
      lines.push(`| ${s.table.head.map(() => "---").join(" | ")} |`);
      for (const row of s.table.rows) lines.push(`| ${row.join(" | ")} |`);
      lines.push("");
    }
  }

  lines.push("## FAQ", "");
  for (const item of FAQ_ITEMS) {
    lines.push(`Q: ${item.q[locale]}`, `A: ${item.a[locale]}`, "");
  }

  return lines.join("\n");
}
