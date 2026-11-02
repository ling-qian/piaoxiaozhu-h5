/**
 * 隐私政策、服务条款与联系页的唯一内容源。
 *
 * 这里只写能核对的事实：收什么数据看 `v1/apps/api-worker/src/db/schema.sql`，
 * 套餐数字看 `plans.ts`，收款渠道看 `intl-payments.ts`，图片存放看 `cos.ts`。
 * 没核对过的承诺一律不写——法务页面上的一句想当然，比不写更麻烦。
 *
 * `CONTACT_EMAIL` 是唯一需要人工确认的常量。这个地址要么在 Cloudflare
 * Email Routing 里开通，要么换成你实际在用的邮箱；改完重新部署即可。
 */

import type { DocLocale, DocSection } from "@/app/guide/content";

export const CONTACT_EMAIL = "support@qianling-tech.top";

/** 内容改动时同步这一天，页面上的「更新于」用它 */
export const LEGAL_UPDATED = "2026-10-31";

export type LegalKind = "privacy" | "terms" | "contact";

export const LEGAL_TITLE: Record<LegalKind, Record<DocLocale, string>> = {
  privacy: { en: "Privacy Policy", zh: "隐私政策" },
  terms: { en: "Terms of Service", zh: "服务条款" },
  contact: { en: "Contact", zh: "联系我们" },
};

export const LEGAL_SUMMARY: Record<LegalKind, Record<DocLocale, string>> = {
  privacy: {
    en: "What SortReceipts collects, why it is collected, where it is stored, and how to have it deleted. Written to be read, not to be skipped.",
    zh: "这份政策讲清三件事：我们收集什么、数据存在哪里、怎么把它删掉。写给人看，不是写完就没人读的那种。",
  },
  terms: {
    en: "The rules for using SortReceipts: what the service does, what each plan includes, what you may not do, and what happens when something goes wrong.",
    zh: "使用 SortReceipts 的规则：服务做什么、每个套餐包含什么、什么不能做、出问题时怎么处理。",
  },
  contact: {
    en: "How to reach Qianling Tech about SortReceipts, and what to include so the first reply can actually solve the problem.",
    zh: "有问题怎么联系到 Qianling Tech，以及要带上哪些信息，我们才能一次把问题解决。",
  },
};

export const PRIVACY_SECTIONS: Record<DocLocale, DocSection[]> = {
  en: [
    {
      title: "What this policy covers",
      lead: `This policy explains what SortReceipts collects, why, where it is kept, and how to have it removed. It applies to the web app at sortreceipts.qianling-tech.top, operated by Qianling Tech.`,
      paragraphs: [
        "The app runs on Cloudflare's network. The account database and the uploaded receipt images sit in two separate services, both listed under sharing.",
      ],
    },
    {
      title: "What we collect",
      bullets: [
        "Account details: the email address you register with, and a password. The password is stored as a PBKDF2-SHA256 hash; the plaintext is never kept.",
        "Receipt images: the photos you upload, stored under a key tied to your account.",
        "Extracted fields: merchant name, amount, tax, date, category, and the raw text the model read from the image. Each receipt also gets a fingerprint so duplicates can be spotted.",
        "Records you type in: project names, customer names and contact details, and the contents of monthly reports.",
        "Payment records: plan, amount, currency and transaction ID. Card numbers go straight to Stripe or PayPal and never reach our servers.",
        "Abuse prevention: hashed IP addresses rather than raw ones, counts of failed sign-ins, per-user API call counters, and hashed email verification codes.",
      ],
    },
    {
      title: "Why we process it",
      bullets: [
        "To run the service: read the image, file the record, and show monthly totals.",
        "To bill you and answer support requests.",
        "To keep the service usable: rate limits, duplicate accounts, and abuse.",
      ],
      paragraphs: [
        "We do not use your receipts for advertising, and we do not use them to train models of our own.",
      ],
    },
    {
      title: "Who else sees it",
      bullets: [
        "Cloudflare — hosts the site, the API and the account database.",
        "Tencent Cloud COS — stores the receipt images.",
        "Stripe and PayPal — process card and PayPal payments.",
        "Resend — delivers the six-digit verification email.",
        "An external vision model API — receives the image during recognition, because that is how the fields are produced.",
      ],
      paragraphs: ["We do not sell personal data."],
    },
    {
      title: "How long we keep it",
      paragraphs: [
        "Account data stays until you ask us to delete the account. A receipt image stays until you delete the record it belongs to, or delete the account.",
        "Verification codes expire within minutes. Counters used for rate limits are kept only long enough to enforce those limits.",
      ],
    },
    {
      title: "Cookies and measurement",
      paragraphs: [
        "One cookie keeps you signed in. It is called `px_token` and the app does not work without it.",
        "We do not set advertising cookies, and we do not follow you across other sites. Page counts are collected in aggregate, without cookies.",
      ],
    },
    {
      title: "Your choices",
      bullets: [
        "Ask for a copy of your data, or for anything wrong in it to be corrected.",
        "Delete a single receipt in the app at any time.",
        "Delete the whole account by emailing us; there is no self-serve button yet.",
        "Export records as CSV on paid plans.",
      ],
      paragraphs: [
        `Write to ${CONTACT_EMAIL} from the address on the account. We will reply and confirm when the request is done.`,
      ],
    },
    {
      title: "Children",
      paragraphs: [
        "This is a business tool and is not intended for anyone under 16. If an account belongs to a child, tell us and we will remove it.",
      ],
    },
    {
      title: "Changes",
      paragraphs: [
        "When this policy changes in a way that affects you, the new version is posted here with a new date, and material changes are announced on the site.",
      ],
    },
  ],
  zh: [
    {
      title: "这份政策管什么",
      lead: `这份政策讲清 SortReceipts 收集什么、为什么收集、存在哪里、怎么删除。适用于 sortreceipts.qianling-tech.top 这个网页应用，运营方是 Qianling Tech。`,
      paragraphs: [
        "应用跑在 Cloudflare 的网络上。账号数据库和上传的票据图片放在两个不同的服务里，两者都写在「谁会看到」一节。",
      ],
    },
    {
      title: "我们收集什么",
      bullets: [
        "账号信息：注册用的邮箱，以及一个密码。密码以 PBKDF2-SHA256 哈希保存，明文从不留存。",
        "票据图片：你上传的照片，按与账号绑定的路径存放。",
        "识别出的字段：商户名、金额、税额、日期、分类，以及模型从图片里读到的原始文字。每张票据还会生成一个指纹，用来查重。",
        "你手动录入的内容：项目名、客户名与联系方式、月度报表内容。",
        "支付记录：套餐、金额、币种、交易号。卡号直接交给 Stripe 或 PayPal，不会经过我们的服务器。",
        "防滥用数据：加盐哈希后的 IP（不留原始地址）、登录失败次数、按用户计的接口调用数、哈希后的邮箱验证码。",
      ],
    },
    {
      title: "为什么处理这些数据",
      bullets: [
        "为了提供服务：读图片、入账、算出月度合计。",
        "为了收款和处理你的售后请求。",
        "为了服务本身可用：限流、防重复注册、防滥用。",
      ],
      paragraphs: ["我们不把你的票据用于广告，也不拿它训练我们自己的模型。"],
    },
    {
      title: "谁会看到",
      bullets: [
        "Cloudflare：托管站点、接口与账号数据库。",
        "腾讯云 COS：存放票据图片。",
        "Stripe 与 PayPal：处理银行卡和 PayPal 付款。",
        "Resend：发送六位邮箱验证码。",
        "外部视觉模型接口：识别时接收图片，字段就是这样读出来的。",
      ],
      paragraphs: ["我们不出售个人数据。"],
    },
    {
      title: "数据留多久",
      paragraphs: [
        "账号数据留到你要求删除为止。单张票据图片留到你删掉对应记录、或删掉整个账号为止。",
        "验证码几分钟内过期。用于限流的计数只保留到限流需要的那段时间。",
      ],
    },
    {
      title: "Cookie 与统计",
      paragraphs: [
        "只有一个用来保持登录状态的 Cookie，名叫 `px_token`。没有它应用无法工作。",
        "我们不设广告 Cookie，也不跨站跟踪你。页面访问量按汇总计数收集，不使用 Cookie。",
      ],
    },
    {
      title: "你可以做什么",
      bullets: [
        "要一份自己的数据副本，或要求更正错误的内容。",
        "在应用里随时删掉单张票据。",
        "发邮件要求删除整个账号（目前还没有自助删除按钮）。",
        "付费套餐可以把记录导出成 CSV。",
      ],
      paragraphs: [`用账号绑定的邮箱写信到 ${CONTACT_EMAIL}。处理完成后我们会回信确认。`],
    },
    {
      title: "未成年人",
      paragraphs: ["这是经营工具，不面向 16 岁以下用户。如果账号属于未成年人，告诉我们，我们会删除。"],
    },
    {
      title: "政策变更",
      paragraphs: ["政策有影响你的改动时，新版本会发在这里并更新日期；重要改动会在站内公告。"],
    },
  ],
};

export const TERMS_SECTIONS: Record<DocLocale, DocSection[]> = {
  en: [
    {
      title: "The agreement",
      lead:
        "By creating an account or using the app, you agree to these terms. If you do not agree, do not use the service.",
    },
    {
      title: "What the service is",
      paragraphs: [
        "SortReceipts reads photos of receipts, extracts the vendor, amount, date and tax, files each record under a category, and keeps monthly totals current.",
        "It is not an accounting firm, not a tax filing service, and not a source of tax or legal advice. What it produces is a clean set of records for you or your accountant to start from.",
      ],
    },
    {
      title: "Your account",
      bullets: [
        "Use an email address you control and keep it accurate.",
        "Keep your password to yourself; activity under your account is treated as yours.",
        "One person per account. Do not share credentials or resell access.",
        "Tell us promptly if you believe the account has been compromised.",
      ],
    },
    {
      title: "Plans and prices",
      table: {
        head: ["Plan", "Price", "Receipts", "Projects", "CSV export"],
        rows: [
          ["Free", "$0", "5 per month", "1", "No"],
          ["Pro", "$3.99 per month", "200 per month", "10", "Yes"],
          ["Business", "$13.99 per month", "Unlimited", "Unlimited", "Yes"],
        ],
      },
      paragraphs: [
        "Prices are in US dollars for accounts billed through Stripe or PayPal. Longer periods are sold at a discount, and the checkout page shows the exact amount and currency before you confirm.",
        "A plan is bought for a fixed period. We do not charge again automatically when it ends. When the period runs out, the account returns to the free plan unless you renew.",
      ],
    },
    {
      title: "Payments and problems",
      paragraphs: [
        "Stripe and PayPal handle the money, and their own terms apply to each transaction.",
        `If a charge looks wrong, email ${CONTACT_EMAIL} with the date and the amount. We will look at the order record and answer.`,
      ],
    },
    {
      title: "Acceptable use",
      bullets: [
        "Do not upload content you have no right to store.",
        "Do not automate requests beyond your plan limits, or try to get around rate limits.",
        "Do not attempt to reach another account's data.",
        "Do not use the service for anything unlawful.",
      ],
    },
    {
      title: "Your content",
      paragraphs: [
        "The images and records you upload remain yours. You allow us to store them, send an image to the recognition service, and show the results back to you — that is what running the service means.",
        "We do not publish your records and we do not sell them.",
      ],
    },
    {
      title: "What the scan can and cannot do",
      paragraphs: [
        "Recognition is a machine reading a photo. Blur, glare, crumpled paper and handwriting all raise the error rate, and handwriting is the case where manual entry is still the better choice.",
        "Check the four fields before you rely on a total. Duplicate detection is a hint, not a proof.",
      ],
    },
    {
      title: "Availability and changes",
      paragraphs: [
        "We aim to keep the service available, but downtime for maintenance or upstream failures can happen, and no uptime figure is promised.",
        "Features and plan limits may change. When a change reduces what your current plan includes, we will announce it on the site before it takes effect.",
      ],
    },
    {
      title: "Ending the agreement",
      paragraphs: [
        "You can stop using the service at any time. We may suspend an account that breaks these terms or harms the service.",
        "If we end your access for a reason other than a breach, we will refund the unused part of any paid period.",
      ],
    },
    {
      title: "Liability",
      paragraphs: [
        "The service is provided as it is. To the extent the law allows, we are not liable for indirect or consequential losses, and our total liability is limited to the amount you paid us in the twelve months before the claim.",
        "Nothing here limits rights you have under mandatory consumer law.",
      ],
    },
    {
      title: "Changes to these terms",
      paragraphs: [
        "When these terms change, the new version is posted here with a new date. Continuing to use the service after that means you accept the new version.",
      ],
    },
  ],
  zh: [
    {
      title: "这份条款管什么",
      lead: "注册账号或使用本应用，即表示你同意这份条款。不同意就不要使用。",
    },
    {
      title: "这个服务是什么",
      paragraphs: [
        "SortReceipts 读取票据照片，提取商户、金额、日期与税额，把每条记录归进一个分类，并持续更新月度合计。",
        "它不是会计事务所，不是报税服务，也不提供税务或法律建议。它产出的是一套干净记录，供你或你的会计在此基础上开始工作。",
      ],
    },
    {
      title: "你的账号",
      bullets: [
        "用你能控制的邮箱注册，并保持信息准确。",
        "密码自己保管；账号下的操作视为你本人的操作。",
        "一个账号对应一个人。不要共用凭证，也不要转售访问权限。",
        "如果你认为账号已被盗用，尽快告诉我们。",
      ],
    },
    {
      title: "套餐与价格",
      table: {
        head: ["套餐", "价格", "每月票据", "项目数", "CSV 导出"],
        rows: [
          ["免费版", "$0", "5 张", "1 个", "无"],
          ["专业版", "$3.99 / 月", "200 张", "10 个", "支持"],
          ["企业版", "$13.99 / 月", "不限", "不限", "支持"],
        ],
      },
      paragraphs: [
        "通过 Stripe 或 PayPal 付款的账号，价格以美元计。购买更长周期有折扣，付款页会在你确认前显示准确的金额与币种。",
        "套餐按固定周期购买。周期结束时我们不会自动扣款；到期不续费，账号回到免费版。",
      ],
    },
    {
      title: "付款与异常",
      paragraphs: [
        "款项由 Stripe 与 PayPal 处理，每一笔交易同时适用它们的条款。",
        `如果某笔扣款看起来不对，写信到 ${CONTACT_EMAIL}，附上日期与金额。我们会查订单记录再答复。`,
      ],
    },
    {
      title: "使用限制",
      bullets: [
        "不要上传你无权保存的内容。",
        "不要超出套餐额度发起自动化请求，也不要绕过限流。",
        "不要试图访问别人账号里的数据。",
        "不要把这个服务用于违法用途。",
      ],
    },
    {
      title: "你的内容",
      paragraphs: [
        "你上传的图片和记录归你所有。你允许我们保存它们、把图片发给识别服务、再把结果展示给你——这正是提供服务本身。",
        "我们不会公开或出售你的记录。",
      ],
    },
    {
      title: "识别能做到和做不到的",
      paragraphs: [
        "识别是机器在读一张照片。模糊、反光、皱纸和手写都会抬高错误率；手写单据目前仍建议手动录入。",
        "在依赖合计数之前，请核对那四个字段。查重结果是提示，不是结论。",
      ],
    },
    {
      title: "可用性与变更",
      paragraphs: [
        "我们会尽力保持服务可用，但维护和上游故障仍可能造成中断，我们不作可用率的承诺。",
        "功能与套餐额度可能调整。若某项调整会减少你当前套餐包含的内容，我们会在生效前于站内公告。",
      ],
    },
    {
      title: "终止",
      paragraphs: [
        "你可以随时停止使用。对违反条款或损害服务的账号，我们可以暂停访问。",
        "如果终止原因不是你违约，我们会退还未使用的付费周期部分。",
      ],
    },
    {
      title: "责任范围",
      paragraphs: [
        "服务按现状提供。在法律允许的范围内，我们不对间接损失承担责任，累计责任以索赔前十二个月内你支付的金额为上限。",
        "本条款不限制消费者保护法赋予你的强制权利。",
      ],
    },
    {
      title: "条款变更",
      paragraphs: ["条款有改动时，新版本会发在这里并更新日期。改动后继续使用，视为接受新版本。"],
    },
  ],
};

export const CONTACT_SECTIONS: Record<DocLocale, DocSection[]> = {
  en: [
    {
      title: "Email",
      lead: `The address is ${CONTACT_EMAIL}.`,
      paragraphs: [
        "SortReceipts is run by a small team, and every message is read by a person. There is no phone line and no live chat, because there would be nobody on the other end during most of the day.",
      ],
    },
    {
      title: "What to include",
      bullets: [
        "The email address on your account.",
        "What you did, and what happened instead.",
        "A screenshot if the problem is visual.",
        "For billing: the date, amount and currency of the charge.",
      ],
      paragraphs: [
        "A message that names one problem and includes the account email gets answered in one round. A message without them usually costs two.",
      ],
    },
    {
      title: "How fast we answer",
      paragraphs: [
        "We aim to reply within two business days. Billing problems and account deletions are handled first.",
      ],
    },
    {
      title: "Deleting your account",
      paragraphs: [
        `Send the request from the address on the account to ${CONTACT_EMAIL}. We confirm by email when the records and images are gone.`,
        "Single receipts can be deleted in the app without waiting for us.",
      ],
    },
    {
      title: "Security reports",
      paragraphs: [
        "If you find a vulnerability, use the same address with the subject line Security. Please describe the steps and give us a chance to fix it before publishing.",
      ],
    },
  ],
  zh: [
    {
      title: "邮箱",
      lead: `地址是 ${CONTACT_EMAIL}。`,
      paragraphs: [
        "SortReceipts 由一个小团队运营，每封来信都有人读。我们没有电话线，也没有在线客服，因为大部分时间那头没有人守着。",
      ],
    },
    {
      title: "信里请带上",
      bullets: [
        "账号绑定的邮箱。",
        "你做了什么，实际发生了什么。",
        "如果是界面问题，附一张截图。",
        "如果是账单问题，附上扣款日期、金额与币种。",
      ],
      paragraphs: ["一封讲清一个问题、带上账号邮箱的信，通常一轮就能解决。缺了这些信息，往往要来两个来回。"],
    },
    {
      title: "多久回信",
      paragraphs: ["我们争取在两个工作日内回复。账单问题和账号删除优先处理。"],
    },
    {
      title: "删除账号",
      paragraphs: [
        `用账号绑定的邮箱写信到 ${CONTACT_EMAIL}。记录和图片清完后，我们会回信确认。`,
        "单张票据不用等我们，可以直接在应用里删。",
      ],
    },
    {
      title: "安全问题",
      paragraphs: [
        "发现漏洞请发到同一个地址，标题写「安全」。请说明复现步骤，并给我们修复的时间再公开。",
      ],
    },
  ],
};

export function legalSections(kind: LegalKind): Record<DocLocale, DocSection[]> {
  if (kind === "privacy") return PRIVACY_SECTIONS;
  if (kind === "terms") return TERMS_SECTIONS;
  return CONTACT_SECTIONS;
}
