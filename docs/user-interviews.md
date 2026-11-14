# 用户访谈提纲（W9 验证）

这一轮只回答三个问题：老板能不能感知到「被多收钱」这件事，愿意为它付多少，会计这条渠道是不是比一个个谈老板更快。

访谈不要拿产品当主角。产品只在一个环节出现：看完找钱报告之后的十分钟。

## 1. 招谁

**五位独立餐厅老板。** 条件三条：一到三家店、供应商给纸质发票或对账单、账已经交给外部会计或簿记公司。三条都满足才约，缺一条就换人。

**五位记账公司或簿记。** 手上至少十家餐饮客户，且客户现在还要把票据交给他们。

**排除：** 用了 POS 全自动对账的连锁；纯外卖云厨房（几乎没有供应商发票）。

**怎么约。** 用 `docs/overseas-promo-kit.md` 里的冷邮件变体，把卖点那句换掉：

> I'm not selling anything in this email. I'm trying to understand how month-end receipts actually work in independent restaurants, and I'd pay $25 for 20 minutes of your time.

**激励。** 老板给 $25 礼品卡，记账公司给一份免费的样本报告。

## 2. 开场白（照着念）

> Thanks for the 20 minutes. I'm not pitching anything today. I'm trying to understand how the month-end work actually happens in your restaurant, not how it should happen. There are no right answers — "we just use a spreadsheet" is a useful answer.

录音之前先问一句：`Do you mind if I take notes? I won't quote you by name.`

## 3. 问题稿

问题按「过去发生过什么」来问，不问「你会不会用」。人会礼貌地答应未来，但只有过去的行为可信。

### A. 现在怎么做的（5 分钟）

1. `Walk me through the last time you handed receipts to your accountant. What did you do, in order?`
   逼他说到具体那一天、具体动作。答得含糊就追：`Was that last week or last month? Who was with you?`
2. `Who actually does this — you, a manager, someone in the family?`
3. `How long did it take, start to finish?`
4. `What did you use — a paper bag, phone photos, a spreadsheet, an app?`

### B. 钱是在哪丢的（10 分钟，核心）

这三问对应找钱报告里的三类检查。每一问都要问到「金额 + 时间 + 怎么发现的」。

5. `Last month, what did you spend on food and supplies? How do you know that number?`
6. `Has a supplier ever billed you twice for the same delivery? What happened, and how did you catch it?`
7. `When did you last notice a supplier raised prices? How did you find out — did they tell you, or did you see it on the invoice?`
8. `Has your accountant ever asked for an invoice you couldn't find? What did you do?`

追问模板：`How much was that?` `When was it?` `What did you do next?` `Who caught it?`

### C. 现在付了什么（5 分钟）

9. `What do you pay for bookkeeping each month, and who do you pay?`
10. `What software do you already pay for — POS, inventory, accounting?`
11. `What have you tried and stopped using? Why did you stop?`

第 11 问最有价值。停用的原因，往往就是我们将来会死在同一处的那个原因。

### D. 看样本（5 分钟）

把 [找钱报告样本](samples/money-found-report.html) 打印出来，正面朝上放在桌上，不要先解释。

12. `Here's a one-page report built from one month of a restaurant's invoices. What's the first thing you look at?`
13. `If this arrived every month, what would you do with it?`
14. `Which line would make you open it again next month — and which line would you ignore?`
15. `What's missing that would make you not trust these numbers?`

### E. 价格（最后 5 分钟，先别报数）

16. `If this found $1,200 you would otherwise have missed, what would it be worth per month?`
17. 听到回答后再给区间：`Somewhere between $4 and $50 a month — where does this sit for you, and what would make the higher number fair?`

### F. 会计版追加四问

- `How many restaurant clients do you have, and how do they send you receipts today?`
- `Walk me through onboarding a new restaurant client. What do you ask them to do in the first month?`
- `What would make you refuse to take a client's data in a new format?`
- `Does your software import a plain CSV, or does it need a specific layout?`（这问决定 QuickBooks 导出要做到什么程度）
- `If a client sent you a link like this every month, would it save you time or create one more thing to check?`

## 4. 记录表

每访完一个，立刻填，别攒到周末再回忆。

| 字段 | 填什么 |
|---|---|
| 受访者 | A/B/C，匿名编号；记类型（老板/会计）与门店数 |
| 上月记账耗时 | 分钟或小时，原话照抄 |
| 食材成本占比 | 能说出数字 / 只能说「大概」 / 说不出 |
| 具体损失经历 | 有金额和时间的算一条，只有「好像有过」的不算 |
| 对样本的第一反应 | 第一眼看哪里，原话 |
| 愿意付的价格 | 他自己说的数字 |
| 下一步 | 愿意试用 / 愿意看上线版 / 没兴趣 |

## 5. 判定标准（先写死，别事后改）

- **找钱成立**：十个人里至少三人能讲出具体一笔，带金额和时间。只有「好像有过」不算。
- **价格成立**：至少三人在 $19 这一档说可以试，且没有人只接受免费。
- **会计渠道成立**：至少两家记账公司愿意拿现有客户试。
- **反证条件**：如果多数老板说「这些都是会计在处理，我不关心」，那就别卖老板，改卖会计。这一条要在访谈里主动去找，不要回避。

十条访谈全部做完再一起判断。中途改标准，等于让结论迁就希望。

## 6. 时间安排

| 天 | 动作 |
|---|---|
| 第 1 天 | 发十封约访邮件（老板五封、会计五封），同时发出样本报告 |
| 第 2–4 天 | 每天两到三场，每场 30 分钟，访完立刻填表 |
| 第 5 天 | 整理：一张表、三句结论、一个「下一步做不做」的判断 |
| 第 6 天 | 把结论写回 `docs/paid-value-research.md` 第 7 节，替换掉假设 |

## 7. 礼貌与合规

- 录音先问许可；对方不愿意就只记原话。
- 全程不推销。结束前只问一句：`Can I show you the working version when it's ready?`
- 引用一律匿名，店名换成 A/B/C，金额可以保留，商户名去掉。

## 8. 样本报告是怎么来的

`docs/samples/money-found-report.html` 里的数字是虚构的，但每一项都对应产品现在真能算出来的检查：

| 报告里的条目 | 数据来源 | 现在能不能算 |
|---|---|---|
| 重复付款 | 同一发票号出现两次 | 能，`duplicate_invoice_no` |
| 缺票支出 | 支出既无发票号也无上传文件 | 能，`missing_invoice` |
| 金额异常 | 同分类内超过中位数 3 倍且超过均值 2.5 个标准差 | 能，`amount_outlier` |
| 没有日期 | 记录缺票据日期 | 能，`missing_date` |
| 供应商涨价 | 同一供应商同一商品跨月单价变化 | **还不能**，要先把行项目按商品归一 |

给受访者看的样本里没有放「供应商涨价」这一条，因为现在算不出来。访谈里可以口头问第 7 问，但不能拿一张做不到的报告去换好评——那样验证到的只是别人对一个不存在的产品的兴趣。
