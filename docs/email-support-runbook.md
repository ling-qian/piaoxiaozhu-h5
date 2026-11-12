# support@ 邮件通道上线说明

这份文件写的是「让 `support@qianling-tech.top` 能收信、并且按类型分好类转给收件箱」的完整步骤，以及出问题时怎么退回去。

代码已经写好，在 `v1/apps/api-worker`：`src/lib/mail-router.ts` 按收件域分流，`src/lib/support-mail.ts` 负责分类与转发。剩下的是 Cloudflare 控制台的配置，Wrangler 管不到 Email Routing，必须手动做一次。

## 0. 先看结论

2026-11-12 的实际状态（用 `dig` 和 SMTP RCPT 探测确认）：

- 主域 MX 已指向 `route1/2/3.mx.cloudflare.net`，SPF 已有且只有一条，**域名接入这一步早就做完了**。
- 对 `support@` 和 `definitely-not-a-real-alias@` 做 RCPT 探测，两个都返回 `250 Ok`。说明域上很可能开了 **catch-all**，邮件先进 Cloudflare 再决定去向。
- 所以现在缺的不是 MX，而是两件东西：一条把 `support@` 送到本 Worker 的规则（或确认 catch-all 已指向 `piaoxiaozhu-api`），以及 `SUPPORT_INBOX` 这个转发目标。
- 在 `SUPPORT_INBOX` 配好之前，旧代码会把非 `r-<token>` 地址一律 `setReject`，发信人收到的是退信。部署新代码后才会开始转发。
- 域上没有 DMARC 记录。不影响收信，但影响目标邮箱对转发邮件的信任度；有空补一条 `v=DMARC1; p=none; rua=mailto:...` 即可。

### 2026-11-12 实际配置（已核对）

接口用 `wrangler email routing` 查过：

| 项 | 状态 |
|---|---|
| Email Routing | 已启用，status `ready` |
| 自定义规则 | 无 |
| Catch-all | 启用，指向 `worker:piaoxiaozhu-api` |
| Destination addresses | `1024194325@qq.com`，已创建，**待验证** |
| Worker secret | `SUPPORT_INBOX=1024194325@qq.com` 已设置 |
| Worker 版本 | `dcc04ff2`（含分拣代码） |

因为 catch-all 已经指向本 Worker，不需要再建任何显式规则；`support@` 会直接进 `mail-router.ts`。现在唯一缺的是去 `1024194325@qq.com` 点那封 Cloudflare 验证邮件——**没点之前 `forward()` 会失败，来信仍然退信**。
- 分拣逻辑按收件人本地部分分类，转发到你在 Email Routing 里**验证过**的目标邮箱。目标邮箱未验证时 `forward()` 会失败，Worker 会退信而不是静默丢信。
- 不做自动回复。`message.reply()` 要求来信通过 DMARC、回信域名与收信域名一致，任何一条不满足就抛异常；对这个体量，误判比省事更贵。
- 主域和收票子域 `in.qianling-tech.top` 是两套独立的 Email Routing 配置，改主域不影响收票。

## 1. 支持哪些地址

| 地址 | 队列 | 说明 |
|---|---|---|
| `support@` `help@` `hello@` | support | 通用咨询 |
| `billing@` `payment@` `payments@` `refund@` | billing | 付费、退款、发票 |
| `privacy@` `legal@` `dpo@` | legal | 隐私、数据删除、法务 |
| `partner@` `partners@` | partners | 合作、转介 |

主题里出现 `refund`、`chargeback`、`charged twice`、`退款`、`重复扣款` 时改判到 billing 并标加急；出现 `GDPR`、`CCPA`、`delete my data`、`删除数据` 时改判到 legal 并标加急。转发时会加三个 `X-SortReceipts-*` 头，方便人工辨认和以后接工单系统。

表里没有的地址一律退信。这是有意的：主域上任何写错的地址都不该被静默吞掉。

## 2. 部署顺序

**先部署 Worker，再建路由规则。** Email Routing 的「Send to a Worker」下拉框只列出已部署的 Worker。

```bash
cd v1/apps/api-worker
npx wrangler deploy
```

部署完设置转发目标（这个地址必须是下一步里验证过的收件箱）：

```bash
npx wrangler secret put SUPPORT_INBOX
# 提示输入时填你的收件箱，例如 you@gmail.com
```

`SUPPORT_INBOX` 是普通配置而不是密钥，但如果写进 `wrangler.jsonc` 的 `vars`，它会进 git。用 secret 更省心。

## 3. 确认主域的 Email Routing

MX 和 SPF 已经在了，这一步只是核对，不用重建：

```bash
dig +short MX qianling-tech.top
dig +short TXT qianling-tech.top | grep spf
```

预期是三条 `*.mx.cloudflare.net` 和一条 `v=spf1 include:_spf.mx.cloudflare.net ~all`。

然后进控制台 **Compute → Email Service → Email Routing**，选中 `qianling-tech.top`，只看两处：

1. **Destination addresses**：确认收信邮箱在列表里且状态是 Verified。没验证的地址不能作为转发目标，`SUPPORT_INBOX` 填了也会失败。
2. **Catch-all**：RCPT 探测显示任意地址都返回 `250`，说明大概率开着。确认它指向哪里——这是本次唯一必须看清的一项，见下一节。

## 4. 路由规则与 catch-all

先看 Catch-all 现在指向谁：

- **指向 `piaoxiaozhu-api`**：什么都不用加，`support@` 已经会进本 Worker，部署新代码再配好 `SUPPORT_INBOX` 即可生效。这是最可能的情况，因为收票子域用同一套逻辑。
- **指向别的 Worker、邮箱或 Drop**：给四个地址各建一条显式规则，动作选 **Send to a Worker** → `piaoxiaozhu-api`，否则 support 的信到不了这段代码。

| 匹配 | 动作 |
|---|---|
| `support@qianling-tech.top` | Send to Worker → `piaoxiaozhu-api` |
| `billing@qianling-tech.top` | Send to Worker → `piaoxiaozhu-api` |
| `privacy@qianling-tech.top` | Send to Worker → `piaoxiaozhu-api` |
| `partner@qianling-tech.top` | Send to Worker → `piaoxiaozhu-api` |

同一个邮箱前缀不要建两条规则，Cloudflare 会报冲突。显式规则优先于 catch-all，两者并存没有坏处。

Catch-all 保留也可以：代码对不认识的地址会 `setReject`，效果仍然是退信。区别只在于退信发生在 Worker 里，日志能看到一行 `[mail] 收件人不认识`，比 Drop 更有观察价值。

## 5. 验证

按顺序做，四条都过才算接通。

1. **能收**：用另一个邮箱（Gmail 之类）发给 `support@qianling-tech.top`，几秒内 `SUPPORT_INBOX` 应该收到。
2. **分类对**：发一封主题含 `refund` 的信，收件箱里那封信的头部应有 `X-SortReceipts-Tag: billing` 和 `X-SortReceipts-Priority: urgent`。
3. **未知地址会退**：发给 `nobody@qianling-tech.top`。因为 MX 在 RCPT 阶段一律返回 `250`，退信不会是即时的 550，而是几分钟后收到 Cloudflare 的退信邮件，提示 `No such recipient`。收不到退信才是问题。
4. **日志有记录**：

```bash
cd v1/apps/api-worker
npx wrangler tail piaoxiaozhu-api --format pretty
```

成功时会出现一行 `[support] tag=... urgent=... reason=... size=...`。日志不含主题和正文。

再顺手确认收票没被影响：`dig +short MX in.qianling-tech.top` 的结果应该和上线前一致。

## 6. 出问题怎么退

- **只想停 support 收信**：把四条规则的目标从 Worker 改成一个邮箱，或者直接删掉规则。Worker 不用动，代码对其它域名无副作用。
- **Worker 报错但 DNS 正常**：把规则临时改成「Send to an email」指向已验证地址，先保证信能进来，再查 `wrangler tail`。
- **临时停用整个通道**：把 catch-all 改成 Drop，并删掉四条显式规则。Worker 和 MX 都不用动——MX 本来就在，删了只会让域上所有地址一起失联。

## 7. 已知限制

- **只能转发到已验证地址。** 想同时给两个人看，就在 Worker 里调两次 `forward()`，两个地址都要先验证。当前代码只转发一个。
- **转发的信可能被判垃圾。** 转发保留原始 `From`，目标邮箱可能因为 SPF/DKIM 对不上而丢进垃圾箱。首次测试务必翻一下垃圾箱，并在收件箱里给 `support@` 建一条白名单或过滤器。
- **自定义头不能用来做 Gmail 过滤。** Gmail 的过滤器只支持发件人、收件人、主题等固定字段，不认任意 `X-` 头。这些标签目前是给人看的，接入工单系统后才有自动用途。
- **没有工单库。** 现在的实现是「分类 + 转发」，没有把来信写进 D1。要做「support 邮箱自带历史与状态」，得另外加表，那是另一件事。
- **回信的发件人是你自己。** 从收件箱直接回复，对方看到的是个人邮箱地址。要让回信也显示 `support@`，需要在 Cloudflare 的 Email Service 里 onboard 发送域并加 `send_email` 绑定，属于后续可选项。

## 8. 上线后顺手做的两件事

1. 把 `support@qianling-tech.top` 写进落地页页脚、法务页和邮件签名。现在页面上只有表单，没有可回复的地址，退款和删号请求没有正规入口。
2. `docs/overseas-promo-kit.md` 里「`support@` 收不到信」那条阻塞已按本次核查结果改写，真实发信前再按第 5 节验一遍即可。
