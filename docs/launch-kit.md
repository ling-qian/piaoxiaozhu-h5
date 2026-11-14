# SortReceipts 发布包（W8）

这份文件是发布当天直接拿去粘贴的文案、链接顺序和检查项。产品事实以当前线上版本为准：免费版每月 5 张、Pro $3.99/月 200 张、Business $13.99/月不限量。

## 1. 一句话定位

给小型餐饮店的票据记账：拍供应商发票，自动读字段并归入餐饮成本分类，月底生成一份能直接发给会计的只读交付包。

## 2. Product Hunt

**Name**：SortReceipts

**Tagline**（60 字符以内）：

> Restaurant receipts in. A month of numbers out.

**Description**（260 字符以内，当前 258）：

> Photograph supplier invoices. SortReceipts reads vendor, date and amount, files each under eight restaurant cost categories, tracks revenue and margin, and builds a month-end pack your accountant opens without an account. Free: 5 a month. Pro: $3.99 for 200.

**Topics**：Restaurant、Small Business、Accounting、Productivity、AI

**Gallery（4 张，1270×760，已生成）与说明**

1. `docs/launch-screenshots/01-scan-supplier-invoice.png` — 上传一张供应商发票，字段自动填好。  
   Caption: `Scan a supplier invoice. Vendor, date and amount are filled in.`
2. `docs/launch-screenshots/02-eight-categories.png` — 八个餐饮成本分类，不是通用会计科目。  
   Caption: `Eight restaurant cost categories, not a generic chart of accounts.`
3. `docs/launch-screenshots/03-revenue-margin.png` — 月度营业额、支出与毛利。  
   Caption: `Revenue, expenses and gross margin for the month.`
4. `docs/launch-screenshots/04-month-end-pack.png` — 只读交付包，会计不用注册。  
   Caption: `Send your accountant a read-only month-end pack.`

**Maker 第一条评论**：

> I built this for the small restaurants I kept seeing: a bag of supplier receipts, a spreadsheet, and an accountant who asks for missing invoices every month. SortReceipts reads the receipts, sorts them into restaurant cost categories, and produces a month-end pack an accountant can open without an account. The free plan is 5 receipts a month, no card. I would like feedback from anyone who closes books for a restaurant: which fields are missing, and what makes the pack hard to trust?

**发布链接**：

`https://sortreceipts.qianling-tech.top/?utm_source=producthunt&utm_medium=launch&utm_campaign=w8`

**发布前检查**

- 上传头像：`public/icon-512.png`（正方形，240×240 以上）。
- 上传 4 张 1270×760 截图，顺序按上面的 Gallery。
- 选择发布时间：太平洋时间 00:01（Product Hunt 按天排序）。
- Maker 评论在发布后 10 分钟内补上，不要等别人先问。
- 发布后 24 小时回复每一条评论，尤其是问「和 Expensify 有什么不同」的。

## 3. Show HN

**Title**（80 字符以内）：

> Show HN: SortReceipts – receipt OCR and monthly margins for small restaurants

**Body**：

> I built SortReceipts for small restaurant owners who hand a bag of receipts to an accountant every month.
>
> The flow: photograph supplier invoices and counter receipts, a vision model extracts vendor, date, amount and tax, the app files each receipt under one of eight restaurant cost categories, and the month view shows revenue, expenses and gross margin. At month end it builds a read-only pack (summary, category totals, anomaly list, CSV) that an accountant can open without an account.
>
> Stack: Next.js on Cloudflare Workers, D1 for storage, one vision-model call per receipt. Images go to object storage through a short-lived signed URL, so the model fetches the image instead of receiving a large base64 body.
>
> Measured on 50 real scanned receipts: median 13 seconds per receipt, about 2,000 tokens, roughly $0.00015 per receipt at list price. The real constraint is the provider's rate limit on the free tier, not the token cost.
>
> What I am unsure about: the eight categories are restaurant-specific (food, payroll, rent, utilities, platform fees, advertising, office, other), and I do not know whether accountants want a different mapping. Free plan is 5 receipts a month, no card.
>
> Feedback I am looking for: does the month-end pack answer the questions you actually ask a client, and what would make you trust the numbers?

**发布链接**：

`https://sortreceipts.qianling-tech.top/?utm_source=hn&utm_medium=showhn&utm_campaign=w8`

**注意**

- HN 标题不要带「免费」「颠覆」这类词，正文不要放折扣码。
- 发布后不要请人点赞；被识别为投票操纵会直接掉排名。
- 有人在评论里问技术细节时，贴具体数字，比贴官网链接有效。

## 4. 目录与社区

| 渠道 | 地址 | 账号 | 类型 | 链接参数 |
|---|---|---|---|---|
| Product Hunt | https://www.producthunt.com/posts/new | 需要 | 发布 | `utm_source=producthunt&utm_medium=launch&utm_campaign=w8` |
| Hacker News | https://news.ycombinator.com/submit | 需要 | 帖子 | `utm_source=hn&utm_medium=showhn&utm_campaign=w8` |
| Indie Hackers | https://www.indiehackers.com/ | 需要 | 帖子 | `utm_source=indiehackers&utm_medium=post&utm_campaign=w8` |
| BetaList | https://betalist.com/submit | 需要 | 目录 | `utm_source=betalist&utm_medium=directory&utm_campaign=w8` |
| Future Tools | https://www.futuretools.io/submit-a-tool | 不需要 | 表单 | `utm_source=futuretools&utm_medium=directory&utm_campaign=w8` |
| There's An AI For That | https://theresanaiforthat.com/submit/ | 需要 | 表单 | `utm_source=taaft&utm_medium=directory&utm_campaign=w8` |
| SaaSHub | https://www.saashub.com/submit | 需要 | 目录 | `utm_source=saashub&utm_medium=directory&utm_campaign=w8` |
| Launching Next | https://launchingnext.com/submit/ | 不需要 | 表单 | `utm_source=launchingnext&utm_medium=directory&utm_campaign=w8` |
| AlternativeTo | https://alternativeto.net/ | 需要 | 目录 | `utm_source=alternativeto&utm_medium=directory&utm_campaign=w8` |
| r/restaurateurs | https://www.reddit.com/r/restaurateurs/ | 需要 | 社区 | `utm_source=reddit&utm_medium=community&utm_campaign=w8` |
| r/smallbusiness | https://www.reddit.com/r/smallbusiness/ | 需要 | 社区 | `utm_source=reddit&utm_medium=community&utm_campaign=w8` |

**提交时的统一文案**（目录都放不下长描述，用这一段）：

> SortReceipts turns a bag of restaurant supplier receipts into a month of numbers: photo recognition, eight restaurant cost categories, revenue and gross margin, and a read-only month-end pack for the accountant. Free plan: 5 receipts a month.

**注意**

- Reddit 两个板块都禁止纯推广帖。先在评论里回答问题，再发帖；否则会被删。
- 目录站大多要求 logo、截图和一句 tagline，直接复用 Product Hunt 素材。
- 付费加速提交（BetaList 等）先不做，免费队列够了。

## 5. 发布当天的顺序

按太平洋时间：

| 时间 | 动作 |
|---|---|
| 00:01 | Product Hunt 上线，立刻补 Maker 评论 |
| 06:00 | Show HN 发帖 |
| 09:00 | Future Tools、Launching Next、SaaSHub、There's An AI For That |
| 12:00 | 回复 Product Hunt 与 HN 评论；发 Indie Hackers 帖 |
| 18:00 | 看后台「渠道」标签页，记录首日注册来源 |
| 第二天 | 发 Reddit（先在相关帖子里有真实互动） |

## 6. 渠道数据怎么看

后台 `/admin` 的「渠道」标签页按 `source + medium` 聚合四个数：注册、付费用户、付费订单、收入。没有 UTM 的注册归为 `direct`。

- 首日验收：至少一个渠道有注册。
- 14 天验收：至少两个渠道有注册；能说出每个渠道带来的付费用户数。
- 如果 Product Hunt 注册多但不付费，先看免费 5 张是否够用，不要先改价。
- 如果 HN 注册少但付费高，把工程细节写进后续内容，不要转去做投放。

## 7. 当前状态与待办

已经完成：

- 推广链接的 UTM 参数会写进 `px_src` cookie，注册时落到 `signup_sources` 表。
- 后台新增「渠道」标签页，接口为 `GET /api/admin/channels`。
- D1 已建 `signup_sources` 表；线上验证了带 UTM 的落地页会写 cookie。
- Product Hunt 描述已压到 258 字符，Tagline 47 字符，Show HN 标题 77 字符。
- 四张 1270×760 截图已生成，放在 `docs/launch-screenshots/`。

待用户完成：

- Product Hunt、Hacker News、Indie Hackers、Reddit 都需要账号登录；本执行环境没有这些账号，且两个域名在当前网络下连不通。
- 后台「渠道」页还没有人肉眼看过：生产 `ADMIN_TOKEN` 与本地不一致，接口只在无令牌时验证过 401。
- 完整的注册归因链路还没跑过：需要真实邮箱收一次验证码，再回头核对 `signup_sources` 是否落行。
- 发布前确认价格、免费额度和文案没有变化。
- 发布后 24 小时与 14 天的数据要人工回看，后台只负责记录，不会自动判断渠道好坏。

## 8. 支付状态与配置

支付入口现在是开的，走 Dodo。Dodo 是 MoR，税费由它代收代缴。2026-11-10 用真钱跑通了第一笔：Pro $3.99，微信支付实收 CN¥27.68。

线上 Worker 里的配置：

| 项 | 值 |
|---|---|
| `DODO_API_KEY` | live 密钥，`dodo_live_` 开头 |
| `DODO_ENV` | `live` |
| `DODO_PRO_PRODUCT_ID` | `pdt_0NrYWnYVzRSmB3D9X550f` |
| `DODO_ENT_PRODUCT_ID` | `pdt_0NrYWynBFR2eZVKaX60zF` |
| `DODO_WEBHOOK_SECRET` | live 的 `whsec_` |

第一笔付款的验收结果：

| 检查项 | 结果 |
|---|---|
| 支付 | 微信支付成功，CN¥27.68 |
| 订单 | `pending` → `paid`，`transaction_id` 落的是 `pay_` 开头的支付 ID |
| 用户 | `free` → `pro`，到期时间 30 天后 |
| 积分 | `purchase_grant` 只多一条，+300 |
| Webhook | `payment.succeeded` 投递一次，端点返回 200 |

发货是 webhook 推的，不是回跳补的：投递时间与订单 `paid_at` 对得上。重复投递不会重复发货，`fulfillOrder` 用 `status != 'paid'` 做条件更新。

**PayPal 已停用。** 商户账户被 PayPal 判为 `PAYEE_ACCOUNT_RESTRICTED`，所有建单请求返回 422，按钮点下去只会报错。线上 Worker 的 `PAYPAL_CLIENT_ID` 与 `PAYPAL_CLIENT_SECRET` 已经删除，会员页不再显示 PayPal 按钮。申诉结果出来之前不要重新写入这两个密钥。

**测试密钥绝不能配到线上。** 线上曾经配过 `dodo_test_` 开头的 Key，任何人拿 Dodo 的测试卡付款都能白拿 Pro。现在代码会比对 Key 前缀与 `DODO_ENV`：`dodo_live_` 只认 `live`，`dodo_test_` 只认 `test`。对不上时下单接口直接报错，`config` 也返回 `dodo: false`。

当前待办：

- 企业版只验了收银页金额 $13.99，没跑真钱。
- 微信支付是异步的。用户扫码后没完成确认时，支付记录停在 `requires_customer_action`，收银页会显示一句看不懂的英文报错。这种情况钱没扣，重新下单一笔即可。


## 9. 支付事件订阅清单

四个渠道各有一个回调端点。每个端点只处理一个事件，多订的事件会被忽略，少订的事件会让订单永远停在 pending。

| 渠道 | 端点 | 订阅事件 | 验签方式 | 当前状态 |
|---|---|---|---|---|
| Dodo | `/api/payments/dodo/webhook` | `payment.succeeded` | Standard Webhooks，`whsec_` 密钥做 HMAC-SHA256 | live 已配，2026-11-10 真实事件投递成功 |
| PayPal | `/api/payments/paypal/webhook` | `PAYMENT.CAPTURE.COMPLETED` | 调 PayPal 的 `verify-webhook-signature` 接口 | 已停用：账户受限，凭证已从 Worker 移除 |
| Stripe | `/api/payments/stripe/webhook` | `checkout.session.completed` | `stripe-signature` 头做 HMAC-SHA256 | 未配，也没有 Stripe 凭证 |
| 微信 | `/api/payments/wechat/notify` | 支付结果通知（平台主动推送） | 平台证书验签 + APIv3 密钥解密 | 国内版才用，海外版未启用 |

完整地址都拼在 `https://api.qianling-tech.top` 后面。

**四条容易踩的规则**

- 沙盒和 live 是两套 ID。Dodo 的签名密钥、PayPal 的 Webhook ID 都不一样，拿错一个，所有回调都会验签失败。
- 验签用的密钥只有两处：`DODO_WEBHOOK_SECRET` 和 `PAYPAL_WEBHOOK_ID`。切环境就是换这两个值，代码不用改。现在只有 Dodo 在用。
- 回调收到但验签失败时，PayPal 和 Dodo 都会重试。如果日志里一直出现验签失败，先查是不是环境配混了，不要去改代码。
- 改事件列表要同步改代码。代码里判断的就是上表这几个事件名，换事件名等于换逻辑。

**兜底机制**

PayPal 的定时对账任务还在每小时运行，但 PayPal 已停用，扫到的笔数恒为 0。Dodo 和 Stripe 没有对账任务，发货只靠 webhook：Dodo 的回调断了，订单就停在 pending，只能人工查库补。这也是为什么上线前必须确认端点返回 200。

**当前待办**

1. PayPal 申诉：提交业务信息与收款说明材料，拿到 case 号后记在这里。恢复之前不动线上凭证。
2. 企业版真钱验收：$13.99，流程与 Pro 相同，验完把结果补进第 8 节的表。
3. Stripe 仍未接入，也没有凭证。如果 Dodo 将来出问题，它是备选通道。
