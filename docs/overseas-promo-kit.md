# 海外推广物料（W9）

这份文件是给海外渠道直接拿去用的英文文案。产品事实以线上版本为准：免费版每月 5 张、Pro $3.99/月 200 张、Business $13.99/月不限量，交付包对收件人免注册。

三条前提：

- 链接一律带 UTM，参数规则见 `docs/launch-kit.md` 第 6 节。每条内容用自己的 `utm_campaign`，否则后台分不出哪条带来的人。
- 冷邮件只发给公开列出的商户邮箱，正文带真实署名与退订说明。欧盟地址不要群发，先只做美国、英国、加拿大、澳洲。
- 短视频里的识别过程必须是真的。把失败的片段剪掉会拉高预期，用户第一次遇到手写单据就会退订。

## 1. 冷邮件

### 名单从哪来

三个来源，按回复率从高到低：

1. 独立餐厅官网的联系页邮箱（一家店一个地址，不用 info@ 群发）。
2. 记账公司与簿记服务商的官网邮箱，他们是把交付包转给客户的一方。
3. 本地餐饮协会的公开会员名录。

每条邮件单独写开头一句，写不出这一句就跳过这家。群发模板是回复率下降最快的原因。

### 变体 A：给独立餐厅老板

主题：`The receipt bag at month end`

> Hi {{first_name}},
>
> I'm Clark. I built a small tool for restaurant owners who hand a bag of supplier receipts to an accountant every month.
>
> You photograph an invoice, and it reads vendor, date, amount and tax, then files it under one of eight restaurant cost categories. At month end it builds a pack your accountant opens without an account.
>
> Five receipts a month are free, no card. Reply with one receipt and I'll send back what it produced.
>
> Clark, Qianling Tech · support@qianling-tech.top
> Not relevant? Reply "stop" and I won't write again.

正文 89 词，加上署名与退订共 105 词。退订那行不能省，美国 CAN-SPAM 要求每封商业邮件都有退出方式。

### 变体 B：给记账公司与簿记服务商

主题：`Month-end packs from your restaurant clients`

> Hi {{first_name}},
>
> Your restaurant clients probably hand over receipts as a shoebox, a spreadsheet, or a phone gallery.
>
> SortReceipts reads each receipt photo, extracts vendor, date, amount and tax, and files it under one of eight restaurant cost categories. At month end the client sends you a read-only link: summary, category totals, an anomaly list for missing invoices and possible duplicates, and CSV.
>
> You don't need an account to open it. The client pays $3.99 a month for 200 receipts.
>
> Want a sample pack? Reply and I'll build one from a receipt you send.
>
> Clark, Qianling Tech · support@qianling-tech.top
> Reply "stop" to end this.

### 变体 C：第一次没回的跟进

主题：`Re: The receipt bag at month end`

> Hi {{first_name}},
>
> One follow-up, then I'll leave it.
>
> The short version: photograph a supplier invoice, it lands in the right cost category, month end produces one page for your accountant.
>
> Two details decide it for most owners. The free plan is five receipts a month with no card, and whoever receives the pack doesn't need an account.
>
> If this isn't a problem you have, say so and I'll stop writing. If it is, reply with one word and I'll send a sample built from a receipt of yours.
>
> Clark, Qianling Tech · support@qianling-tech.top

跟进只发一次。第二次追问会把域名送进垃圾箱，之后所有邮件都跟着沉。

### 链接

| 变体 | 链接 |
|---|---|
| A | `https://sortreceipts.qianling-tech.top/?utm_source=email&utm_medium=cold&utm_campaign=w9-resto` |
| B | `https://sortreceipts.qianling-tech.top/promo?utm_source=email&utm_medium=cold&utm_campaign=w9-bookkeeper` |
| C | 同 A，不另设 `utm_campaign`，这样 A 与 C 的注册能合起来看 |

正文里不要放链接，第三封再放。第一封带链接的冷邮件，送达率明显更差。

## 2. 十条 15 秒短视频

平台是 TikTok、Instagram Reels、YouTube Shorts，画面统一竖屏 9:16，字幕用英文，全程无口播也能看懂。每条 15 秒，节奏是 3 秒钩子、9 秒主体、3 秒收尾。

编号后面是 `utm_campaign`：`w9-v1` 到 `w9-v10`。同一条视频投三个平台时，`utm_source` 分别写 `tiktok`、`reels`、`shorts`。

**v1 一袋收据**

- 0–3 秒：纸袋里的收据倒在台面上，字幕 `Every month, this bag.`
- 3–12 秒：手机对着其中一张拍照，字段自动填好，字幕 `Vendor, date, amount, tax.`
- 12–15 秒：月底页面，字幕 `One page for your accountant.` 结尾小字 `Free: 5 receipts a month`

**v2 十三秒**

- 0–3 秒：画面是手机屏幕上的计时器，字幕 `How long does one invoice take?`
- 3–12 秒：全程一镜到底拍识别，计时器继续走，字幕停在 `13 seconds.`
- 12–15 秒：字幕 `Photograph it. Don't type it.`

**v3 手写单据**

- 0–3 秒：一张手写送货单，字幕 `Handwriting still breaks it.`
- 3–12 秒：识别结果错了两处，红框圈出来，字幕 `Blur and handwriting raise the error rate. Check four fields.`
- 12–15 秒：字幕 `Printed invoices are the reliable case.`

这条故意拍失败。它换来的是信任，代价是比纯演示少一点播放。

**v4 会计不用注册**

- 0–3 秒：字幕 `Your accountant needs no account.`
- 3–12 秒：把只读链接发到另一台手机，打开后直接看到汇总与分类小计
- 12–15 秒：字幕 `Read-only link. No signup.`

**v5 八个分类**

- 0–3 秒：字幕 `Not a generic chart of accounts.`
- 3–12 秒：八个餐饮成本分类逐个亮起：食材、工资、房租、水电燃气、平台服务费、广告、办公、其他
- 12–15 秒：字幕 `Built for restaurants.`

**v6 毛利一眼看到**

- 0–3 秒：字幕 `Revenue, expenses, margin.`
- 3–12 秒：月度页面的三个数字依次弹出
- 12–15 秒：字幕 `One screen, current month.`

**v7 找不到的那张发票**

- 0–3 秒：字幕 `Which invoice is missing?`
- 3–12 秒：异常清单里滚动到「缺发票」一条，点开看到对应记录
- 12–15 秒：字幕 `The pack lists it before your accountant asks.`

**v8 免费五张**

- 0–3 秒：字幕 `Free is five receipts a month.`
- 3–12 秒：注册页，没有卡号输入框，直接进项目页
- 12–15 秒：字幕 `No card.` 加网站地址

**v9 老板的痛点**

- 0–3 秒：字幕 `"What did you buy last month?"`
- 3–12 秒：老板翻手机相册，一张张收据滑过，停下时是一屏缩略图
- 12–15 秒：字幕 `This is the answer, sorted.`

**v10 月底四分钟**

- 0–3 秒：字幕 `Month end, sped up.`
- 3–12 秒：上传五张、分类、生成交付包，画面加速
- 12–15 秒：字幕 `Four minutes, not four hours.`

### 拍摄与发布

- 全屏录屏比真人出镜稳定，成本也低。前三条可以只录屏。
- 字幕放在画面下方三分之一以上，底部留给平台按钮。
- 每条视频只讲一件事。把分类和毛利塞进同一条，观众一个都记不住。
- 发布后 48 小时内回评论，问「和 Expensify 有什么不同」的那条优先回。

## 3. 社区长帖

### Indie Hackers

标题：`I built receipt sorting for restaurants, then watched 20 owners ignore it`

正文：

> I shipped SortReceipts three weeks ago. It photographs supplier invoices, reads vendor, date, amount and tax, files each under one of eight restaurant cost categories, and produces a month-end pack an accountant can open without an account.
>
> What I got wrong first: I assumed the hard part was OCR. It isn't. Owners photograph receipts fine; what they don't do is think about month end until the accountant asks. So the pack had to be one link, not a dashboard.
>
> What I'm testing now: cold email to independent restaurants, and short screen-recordings on TikTok. Both are early. The one number I trust is cost per receipt — about $0.00015 at list price, median 13 seconds, measured on 50 scanned invoices.
>
> Free plan is five receipts a month, no card. If you run a restaurant or close books for one, I'd like to know which two fields are always missing.

结尾放链接：

`https://sortreceipts.qianling-tech.top/?utm_source=indiehackers&utm_medium=post&utm_campaign=w9-story`

### Reddit（r/restaurateurs、r/smallbusiness）

Reddit 的规则是正文不发外链。正文只写过程和数字，链接放在自己第一条评论里。

标题：`How do you handle the bag of supplier receipts at month end?`

正文：

> Not a pitch — I want to know what the process actually looks like in your restaurant.
>
> I built a tool that photographs invoices and sorts them into restaurant cost categories, and the feedback that changed the product most was about month end rather than scanning. Two things I keep hearing: the accountant asks for invoices you can't find, and the totals don't match what the POS says.
>
> So: who assembles the receipts in your place, how long does it take, and what does your accountant actually ask for? If it's a spreadsheet, what columns does it have?

第一条评论：

> For anyone who wants to see the format I ended up with: https://sortreceipts.qianling-tech.top/?utm_source=reddit&utm_medium=community&utm_campaign=w9-ask

先在本板块回答别人的问题，有真实互动之后再发帖。新账号直接发帖会被过滤成 dead，作者自己看得见，别人看不见。

## 4. 节奏与验收

| 时间 | 动作 |
|---|---|
| 第 1 天 | 发 v1、v2、v5 三条短视频；冷邮件 A 发 20 封 |
| 第 3 天 | 跟进 C；发 v4、v8 |
| 第 5 天 | 冷邮件 B 发 15 封给簿记公司；发 v3、v6 |
| 第 7 天 | Indie Hackers 发帖；发 v7、v9、v10 |
| 第 10 天 | 在 r/restaurateurs 有互动后发帖 |
| 第 14 天 | 看后台渠道页，按 `utm_campaign` 排注册与付费 |

验收看三个数，不看播放量：

- 冷邮件：回复率到 5% 算能跑，低于 2% 先改主题行，不要加量。
- 短视频：至少一条带来注册。带注册的那条，把它的结构复制成下五条。
- 社区：帖子里有没有人描述自己的流程。有人写流程，说明内容对上了；只有点赞没有回复，说明标题吸引的不是目标用户。

## 5. 相关页面状态

推广会把人送到隐私、条款、退款、关于这四个页面，2026-11-10 线上逐个核对过：

| 页面 | 状态 |
|---|---|
| `/privacy` | 英文内容服务端渲染，含第三方清单与数据保留说明 |
| `/terms` | 套餐价格表与线上一致（$0 / $3.99 / $13.99） |
| `/refund` | 14 天全额退款、欧盟英国撤销权、处理时限都写了 |
| `/contact` | 邮箱 `support@qianling-tech.top`，两工作日内回复的承诺与退款页一致 |

发信之前先确认 `support@qianling-tech.top` 能收信。

2026-11-12 复查：MX 已经指向 `route1/2/3.mx.cloudflare.net`，SPF 也有了，域名接入不再是问题。RCPT 探测显示任意地址都返回 `250`，说明主域很可能开着 catch-all；但转发目标与规则尚未核对，因此**还不能下定论说收信已通**。

操作步骤、验证方法和回滚方式都在 [email-support-runbook.md](./email-support-runbook.md)：先在 `v1/apps/api-worker` 部署分拣代码并设置 `SUPPORT_INBOX`，再确认 catch-all 是否指向 `piaoxiaozhu-api`（不指向就给四个地址建显式规则）。

这件事不做完，冷邮件不要开始发。用户回信收不到，比没人回信更伤：前面花掉的名单和送达额度都白费。

另一件与发信有关的事：冷邮件不要用现在发验证码的那个 Resend 域名发。营销邮件和验证码邮件共用一个域名，一有投诉就会拖累六位验证码的送达率。要发就单独开一个子域名或另一个域名，先发自己的邮箱试三天。
