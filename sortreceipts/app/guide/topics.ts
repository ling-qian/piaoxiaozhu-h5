/**
 * 主题集群：主指南下面的三篇子文。
 *
 * 为什么拆开写：一篇长文回答不了「餐饮小票怎么归集」这种具体问题。
 * AI 检索时先匹配问题，再决定引用哪一段；一篇只讲一件事的文章，
 * 比一篇什么都说一点的更容易被整段引用。
 *
 * 三篇各自有独立 URL，互相当内链，也都能回到主指南。
 */

import type { DocLocale, DocSection } from "./content";

export interface DocTopic {
  slug: string;
  title: Record<DocLocale, string>;
  summary: Record<DocLocale, string>;
  sections: Record<DocLocale, DocSection[]>;
  faq: Array<{ q: Record<DocLocale, string>; a: Record<DocLocale, string> }>;
}

export const TOPICS: DocTopic[] = [
  {
    slug: "restaurant-receipts",
    title: {
      en: "How a small restaurant organizes supplier invoices and counter receipts",
      zh: "小餐饮店的票据怎么归集：从送货单到月末的数",
    },
    summary: {
      en: "Restaurant paper comes from three places: supplier invoices, delivery slips and counter receipts. File each one under its cost category at capture time, and month-end becomes a review instead of a retyping job.",
      zh: "小餐饮店的纸来自三个地方：供应商发票、送货单和柜台小票。拍的那一刻就归到成本分类，月底就只剩复核，不用重敲。",
    },
    sections: {
      en: [
        {
          title: "Why restaurant paper goes missing",
          lead: "An invoice arrives with the delivery, gets signed, and then slides under the till.",
          paragraphs: [
            "A supplier invoice is not a document anyone chooses to keep — it comes folded inside a delivery, and the driver wants a signature, not a filing system. The paper lands on a shelf, and the thermal receipt from the counter joins it.",
            "The second reason is volume. A busy kitchen takes several deliveries a day, and a routine that means sitting down at a desk afterwards gets skipped. The routine that survives happens at the door, in the time it takes to check the crates.",
          ],
        },
        {
          title: "The routine: shoot, check, move on",
          lead: "Photograph the invoice before the driver leaves, and check the amount while the delivery is still in front of you.",
          bullets: [
            "Shoot the invoice, not the delivery slip. The slip proves what arrived; the invoice proves what you owe.",
            "Check the total, the invoice date and the tax line in the same minute.",
            "File it under Food & ingredients, or Office supplies when the delivery is packaging and cleaning stock.",
            "Do nothing else. Adding up is the report's job.",
          ],
          paragraphs: [
            "The check is the part people skip. An invoice photographed but never checked is one you will open again at month end, and by then the driver has been and gone.",
          ],
        },
        {
          title: "File by cost type, not by vendor",
          lead: "One category per supplier is the mistake that makes a report unreadable.",
          paragraphs: [
            "A produce wholesaler, a butcher, a dairy and a drinks supplier all go to Food & ingredients. Packaging, foil and cleaning chemicals go to Office supplies. The delivery app's weekly payout goes to Platform fees. The category describes what the money bought, not who took it.",
            "The template has eight lines and no room for a ninth per supplier. When a purchase fits none of them, file it under Other and write what it was in the note.",
          ],
        },
        {
          title: "What the monthly report gives you back",
          lead: "Food cost as a share of revenue, and whether that share moved.",
          paragraphs: [
            "A single invoice tells you nothing. The monthly total tells you whether food cost is drifting, which is the number a restaurant actually runs on. The same screen shows revenue, so the share is visible without a calculator.",
            "Enter revenue on the sales page; the report subtracts recorded costs and shows gross margin. On Pro and Business the month exports as a pack: summary, CSV and a list of anomalies.",
          ],
        },
      ],
      zh: [
        {
          title: "餐饮店的纸为什么会丢",
          lead: "发票跟着送货一起来，签个字，然后就滑到收银台底下了。",
          paragraphs: [
            "供应商发票不是有人专门去收藏的单据。它折在货里一起送到，司机要的是签字，不是归档系统。纸落在货架边上，柜台打出来的小票又叠上去。",
            "第二个原因是数量。忙起来的厨房一天收好几趟货，任何需要「事后坐下来录一下」的流程都会被跳过。能活下来的流程发生在门口，趁点货那几分钟就做完。",
          ],
        },
        {
          title: "流程：拍、核对、继续做事",
          lead: "趁司机还没走拍下发票，货还在眼前时核对金额。",
          bullets: [
            "拍发票，不拍送货单。送货单证明收到了什么，发票才证明要付多少钱。",
            "同一分钟里核对合计、开票日期和税额那一行。",
            "归到「食材」；如果这趟送的是包装和清洁用品，归到「办公用品」。",
            "其余什么都不用做。加总是报表的事。",
          ],
          paragraphs: [
            "核对这一步最常被跳过。拍了但没核对的发票，月底一定会被重新打开一次，而到那时送货的人早走了。",
          ],
        },
        {
          title: "按成本类型归，不按商家归",
          lead: "一家供应商给一个分类，是让报表读不下去的那种错。",
          paragraphs: [
            "蔬菜批发、肉档、乳品和酒水，全都进「食材」。包装、锡纸和清洁剂进「办公用品」。外卖平台每周结的账进「平台服务费」。分类说的是钱买了什么，不是谁收走的。",
            "模板只有八栏，没有给每家供应商单开一栏的位置。确实放不进去的支出，归到「其他」，在备注里写清楚是什么。",
          ],
        },
        {
          title: "月度报表还给你什么",
          lead: "食材成本占营业额的比例，以及这个比例有没有变。",
          paragraphs: [
            "单张发票什么也说明不了。一个月的合计才能回答「食材是不是在往上飘」，这才是餐饮店真正靠它经营的那个数。同一屏里有营业额，占比不用按计算器就能看见。",
            "在营业额页按天记收入，报表减去已记录的支出，给出毛利。专业版和商业版还能把整月导出成交付包：汇总、CSV 和异常清单。",
          ],
        },
      ],
    },
    faq: [
      {
        q: { en: "Should I photograph every delivery note?", zh: "每张送货单都要拍吗？" },
        a: {
          en: "Photograph the invoice. The delivery slip can stay with the paper copy; what the books need is the invoice total, date and tax.",
          zh: "拍发票。送货单可以留在纸质档案里；账上要的是发票的合计、日期和税额。",
        },
      },
      {
        q: { en: "What if the supplier never gave me an invoice?", zh: "供应商一直没给发票怎么办？" },
        a: {
          en: "Ask for a copy by email. If it never arrives, record the payment from the bank statement and describe it in the note; an expense with a note is better than a gap at month end.",
          zh: "请对方邮件补一份。真拿不到，就按银行流水记一条，并在备注里写明；有备注的支出，比月底的一个缺口强。",
        },
      },
      {
        q: { en: "Do I need a separate project for each supplier?", zh: "每个供应商要单建项目吗？" },
        a: {
          en: "No. Projects are for the shops you run, not for the vendors you buy from. Every supplier's invoice goes into the same shop's project.",
          zh: "不需要。项目对应你经营的门店，不对应供货的商家。所有供应商的发票都进同一家店的项目。",
        },
      },
    ],
  },
  {
    slug: "travel-expenses",
    title: {
      en: "The occasional business trip: what to keep and how to file it",
      zh: "偶尔出差和外出采购：留哪几张、怎么归",
    },
    summary: {
      en: "A small restaurant travels rarely, so travel gets no dedicated category. File transport, lodging and meals under Other, describe the trip in the note, and the month becomes readable instead of twenty loose slips.",
      zh: "小餐饮店一年出不了几次差，所以模板不给差旅单开分类。交通、住宿和餐饮都归「其他」，在备注里写明这一趟，月报就不会被二十张散纸打散。",
    },
    sections: {
      en: [
        {
          title: "The six receipt types a trip produces",
          lead: "Transport and lodging carry most of the money; the category is the same for all six.",
          table: {
            head: ["What you paid for", "Category", "What to check on the receipt"],
            rows: [
              ["Train, flight, bus, taxi, ride-hailing", "Other", "Date matches the travel day, not the booking day"],
              ["Hotel or short-term rental", "Other", "Total including city tax, not just the room rate"],
              ["Meals during the trip", "Other", "Write who the meal was with in the note"],
              ["Fuel and tolls", "Other", "Only if the vehicle is used for the business"],
              ["Parking and airport fees", "Other", "Keep the stub, not only the card statement"],
              ["Anything bought for the shop on the way", "Food & ingredients or Office supplies", "File it under what was bought, not under the trip"],
            ],
          },
          paragraphs: [
            "Travel has no line of its own in the eight-category template. A restaurant that travels twice a year does not need a category that sits at zero for eleven months; Other plus a note is enough, and the note stays searchable at month end.",
          ],
        },
        {
          title: "File the whole trip into one project",
          lead: "A project is a store or a line of business, so a trip belongs to whichever one it was for.",
          paragraphs: [
            "A trip does not need its own project. Create one project per line of business, and file the trip's receipts into that project as they happen. The monthly report then shows what the business spent, travel included.",
            "The exception is a business that runs two separate books: two stores, two projects, and the trip goes into the store it was for.",
          ],
        },
        {
          title: "The three mistakes that cost the most",
          lead: "Missing receipts, wrong dates, and expenses that cross a month boundary.",
          bullets: [
            "Waiting until the trip ends: half the slips are gone by then, and the ones left are unreadable.",
            "Booking date instead of travel date: a flight booked on the 3rd and flown on the 9th belongs in the month it was flown.",
            "Crossing month end: a trip that runs from the 28th to the 2nd has receipts in two reports. That is correct, and no manual moving is needed.",
          ],
          paragraphs: [
            "The first one is a habit problem and the third one is not a problem at all — it is how monthly reporting is supposed to work. Only the second is a data problem, and it is fixed by checking the date field at capture time.",
          ],
        },
        {
          title: "What to hand to an accountant afterwards",
          lead: "A monthly CSV with the trip's records grouped by category, not a shoebox.",
          paragraphs: [
            "The export carries vendor, amount, date, tax and category for every record, which is exactly the set an accountant reconciles against bank statements. Receipts themselves stay in the app as signed links, so the paper does not have to survive the trip.",
          ],
        },
      ],
      zh: [
        {
          title: "一趟出差会产生六类票据",
          lead: "钱主要在交通和住宿上，六类票据归到同一个分类。",
          table: {
            head: ["花在哪", "分类", "票据上要核对什么"],
            rows: [
              ["火车、机票、大巴、出租、网约车", "其他", "日期是出行日，不是购票日"],
              ["酒店或短租", "其他", "合计含城市附加费，不只是房费"],
              ["出差期间的餐饮", "其他", "备注里写清和谁吃的"],
              ["加油与过路费", "其他", "车用于业务才计入"],
              ["停车费与机场费", "其他", "留凭条，不能只靠卡账单"],
              ["顺路给店里买的东西", "食材或办公用品", "按买的东西归，不按行程归"],
            ],
          },
          paragraphs: [
            "八类模板里没有差旅这一栏。一年出两次差的店，不需要一个十一个月都显示为零的分类；归「其他」加一句备注就够了，备注在月底还查得到。",
          ],
        },
        {
          title: "整趟行程归到一个项目",
          lead: "项目对应门店或业务线，行程归到它为谁而去的那个项目。",
          paragraphs: [
            "行程不需要单独建项目。按业务线建一个项目，行程里产生的票据随手归进那个项目，月报显示的就是这条业务线花了多少，含差旅。",
            "例外是账目本来就分开的生意：两家店两个项目，行程归到它服务的那家店。",
          ],
        },
        {
          title: "代价最大的三个错误",
          lead: "票据丢失、日期填错、跨月的支出。",
          bullets: [
            "等行程结束再补：到那时一半的票据已经没了，剩下的也看不清。",
            "用购票日代替出行日：3 号买的票、9 号飞的，应该记在 9 号那个月。",
            "跨月：28 号到 2 号的行程，票据会分在两个月的报表里。这是对的，不需要手工搬。",
          ],
          paragraphs: [
            "第一条是习惯问题，第三条根本不是问题——月度报表本来就是这么工作的。只有第二条是数据问题，在拍的时候核对日期字段就能解决。",
          ],
        },
        {
          title: "事后交给会计的是什么",
          lead: "一份按分类归好的月度 CSV，不是一个鞋盒。",
          paragraphs: [
            "导出文件带着每条记录的商户、金额、日期、税额和分类，正好是会计拿去对银行流水的那几列。票据本身留在应用里，靠签名地址查看，纸不用熬过整趟行程。",
          ],
        },
      ],
    },
    faq: [
      {
        q: {
          en: "Can I photograph a receipt after I get home?",
          zh: "回家以后再拍票据行不行？",
        },
        a: {
          en: "It works, but expect more corrections. Thermal paper fades, creases form in a bag, and the date on the receipt is easier to read than the date you remember.",
          zh: "可以，但要接受更多修正。热敏纸会褪色，包里的折痕会加深，票据上印的日期比记忆里的日期可靠。",
        },
      },
      {
        q: { en: "Do fuel receipts count as a business expense?", zh: "加油票算不算业务支出？" },
        a: {
          en: "Only the fuel used for business travel. The app records what you enter; whether a specific litre is deductible is the accountant's call, not the app's.",
          zh: "只有业务出行烧掉的那部分算。应用记录你录入的东西；某一箱油能不能抵扣是会计的判断，不是应用的。",
        },
      },
      {
        q: { en: "Should a trip be its own project?", zh: "行程需要单独建项目吗？" },
        a: {
          en: "Usually not. Projects are for stores or lines of business, so file the trip into the business it was for. A separate project per trip fragments the monthly report into many one-week reports.",
          zh: "通常不需要。项目对应门店或业务线，行程归到它服务的那条业务线。每趟行程单独建项目，月报会被切成一堆一周份的报表。",
        },
      },
    ],
  },
  {
    slug: "month-end-close",
    title: {
      en: "Month-end close in 30 minutes",
      zh: "月末结账三十分钟做完",
    },
    summary: {
      en: "Month-end is four steps: fill the gaps, check the four fields, read the category split and gross margin, then export. Done in that order, it takes about half an hour for a small restaurant with a few hundred receipts.",
      zh: "月末只有四步：补缺口、核对四个字段、看分类占比和毛利、导出。按这个顺序做，几百张票的小店大约半小时能收尾。",
    },
    sections: {
      en: [
        {
          title: "Step 1: fill the gaps",
          lead: "Compare the month's bank statement against the records and look for spending that has no record.",
          paragraphs: [
            "Bank statements are the outside check. A payment to a supplier with no matching record is either a receipt you forgot to photograph or a transfer that is not an expense. Both need a decision, and both are easier to decide now than next quarter.",
          ],
        },
        {
          title: "Step 2: check the four fields",
          lead: "Vendor, amount, date, tax. Anything the scan guessed wrong gets corrected here, once.",
          paragraphs: [
            "The app marks a field as manually corrected when you change it, so the next person reading the report can see which records were touched. That marker is more useful than a perfectly clean report that hides its corrections.",
          ],
        },
        {
          title: "Step 3: read the category split",
          lead: "Look for one category that grew faster than the others. That is the whole point of the month-end read.",
          paragraphs: [
            "Rent and utilities should be flat. Food cost, platform fees and payroll are the ones that move. A category that jumped is where a question gets asked — not a punishment, a question. Cross-check it against revenue: a cost that grew while revenue stayed flat is the one eating the margin.",
          ],
        },
        {
          title: "Step 4: export",
          lead: "CSV out, then hand it over. The report is for you; the export is for whoever keeps the books.",
          paragraphs: [
            "The month-end pack puts the summary, the CSV and the anomaly list behind one read-only link your accountant can open without an account. The free plan covers 5 receipts a month and basic reports, which is enough to test whether the scan handles your particular receipts before paying for a month of them.",
          ],
        },
      ],
      zh: [
        {
          title: "第一步：补缺口",
          lead: "拿当月银行流水对着记录看，找出「花了钱但没有记录」的那些。",
          paragraphs: [
            "银行流水是外部校验。一笔付给供应商的钱如果找不到对应记录，要么是漏拍了一张票，要么是一笔本来就不算支出的转账。两种都要当场判断，而现在判断比下个季度再判断容易得多。",
          ],
        },
        {
          title: "第二步：核对四个字段",
          lead: "商户、金额、日期、税额。识别猜错的地方在这里改一次，只改一次。",
          paragraphs: [
            "改动过的字段会被标成人工修正，后来看报表的人能知道哪些记录动过。这个标记比一份「看起来完美、却看不出改过哪里」的报表有用。",
          ],
        },
        {
          title: "第三步：看分类占比",
          lead: "找那个涨得比其他分类快的分类。这就是月末复盘的全部目的。",
          paragraphs: [
            "房租和水电通常是一条平线。食材、平台服务费和工资才是会动的。某个分类突然跳起来，那里就有一个问题要被问出来——是提问，不是追责。再拿它和营业额对一下：营业额没动、成本涨了的那一类，就是吃掉毛利的那个。",
          ],
        },
        {
          title: "第四步：导出",
          lead: "导成 CSV，然后交出去。报表是给自己看的，导出是给管账的人。",
          paragraphs: [
            "月度交付包把汇总、CSV 和异常清单放在一个只读链接后面，会计不用注册账号就能打开。免费版每月 5 张票加基础报表，够在付钱之前先确认识别能不能读你手上的票。",
          ],
        },
      ],
    },
    faq: [
      {
        q: { en: "How long does month-end actually take?", zh: "月末结账实际要多久？" },
        a: {
          en: "For a business that photographs receipts on the day, about 30 minutes: half of it checking bank-statement gaps, half reading the report. For a business that saved everything up, it is the backlog that sets the time, not the tool.",
          zh: "当天就拍照的店，大约半小时：一半时间对流水缺口，一半时间读报表。攒了一个月的店，决定耗时的是积压量，不是工具。",
        },
      },
      {
        q: { en: "Does the free plan include CSV export?", zh: "免费版能导出 CSV 吗？" },
        a: {
          en: "No. Export is on the Pro and Business plans. The free plan covers 5 receipts a month, 1 project and basic reports.",
          zh: "不能。导出在专业版和商业版。免费版每月 5 张票、1 个项目、基础报表。",
        },
      },
      {
        q: { en: "Can I re-open a closed month?", zh: "结完的月份还能改吗？" },
        a: {
          en: "Yes. Records stay editable, and the report recalculates. A month is a view, not a locked snapshot.",
          zh: "能改。记录一直可编辑，报表会跟着重算。月份是一个视图，不是锁死的快照。",
        },
      },
    ],
  },
];

export function topicBySlug(slug: string): DocTopic | undefined {
  return TOPICS.find((t) => t.slug === slug);
}

export function topicPath(slug: string, locale: DocLocale): string {
  return locale === "zh" ? `/zh/guide/${slug}` : `/guide/${slug}`;
}
