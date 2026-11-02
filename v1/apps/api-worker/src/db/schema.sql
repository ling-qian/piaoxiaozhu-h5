-- 票小助 D1 数据库结构
--
-- 与 PostgreSQL 版逐字段对应。几处刻意的映射：
--   uuid        → TEXT     （存 36 位标准格式，便于和前端、旧数据直接对齐）
--   timestamptz → TEXT     （统一存 ISO 8601 UTC，形如 2026-10-23T07:00:00.000Z。
--                            定长格式可以用字符串比较代替时间比较，且跨时区不丢信息）
--   numeric     → REAL     （金额保留两位；D1 无 decimal 类型）
--   boolean     → INTEGER  （0/1）
--
-- 时间字段一律由应用层写入 UTC 字符串，不依赖数据库默认值——
-- 这样本地 SQLite 与线上 D1 行为一致，也避免时区隐式转换。

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- 用户
CREATE TABLE IF NOT EXISTS users (
  id                      TEXT PRIMARY KEY,
  openid                  TEXT NOT NULL UNIQUE,
  unionid                 TEXT,
  phone                   TEXT UNIQUE,
  -- 邮箱登录（H5 用）：小程序走 wx.login，网页端没有 code 可换，需要独立凭证
  email                   TEXT UNIQUE,
  -- PBKDF2-SHA256 哈希，格式 pbkdf2$迭代次数$盐$摘要（盐与摘要均为 base64url）
  password_hash           TEXT,
  nickname                TEXT,
  avatar_url              TEXT,
  plan_code               TEXT NOT NULL DEFAULT 'free',
  quota_total             INTEGER NOT NULL DEFAULT 10,
  quota_used              INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL,
  plan_expires_at         TEXT,
  plan_remind_stage       TEXT,
  plan_remind_expires_at  TEXT,
  plan_remind_sent_at     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_openid  ON users(openid);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone   ON users(phone);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email   ON users(email);
CREATE INDEX        IF NOT EXISTS ix_users_unionid ON users(unionid);

-- ---------------------------------------------------------------- 客户
CREATE TABLE IF NOT EXISTS customers (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  industry       TEXT,
  contact_name   TEXT,
  contact_phone  TEXT,
  remark         TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_customers_user_id ON customers(user_id);

-- ---------------------------------------------------------------- 项目
CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  industry      TEXT,
  report_month  TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_projects_user_id     ON projects(user_id);
CREATE INDEX IF NOT EXISTS ix_projects_customer_id ON projects(customer_id);

-- ---------------------------------------------------------------- 票据文件
CREATE TABLE IF NOT EXISTS invoice_files (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_url      TEXT NOT NULL,
  file_key      TEXT NOT NULL,
  source        TEXT NOT NULL,
  ocr_status    TEXT NOT NULL DEFAULT 'pending',
  parse_status  TEXT NOT NULL DEFAULT 'pending',
  created_at    TEXT NOT NULL,
  file_hash     TEXT,
  content_kind  TEXT NOT NULL DEFAULT 'invoice'
);
CREATE INDEX IF NOT EXISTS ix_invoice_files_project_id ON invoice_files(project_id);
CREATE INDEX IF NOT EXISTS ix_invoice_files_user_id    ON invoice_files(user_id);
CREATE INDEX IF NOT EXISTS ix_invoice_files_file_hash  ON invoice_files(file_hash);

-- ---------------------------------------------------------------- 票据记录
CREATE TABLE IF NOT EXISTS invoice_records (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_id               TEXT REFERENCES invoice_files(id) ON DELETE SET NULL,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction             TEXT NOT NULL,
  merchant_name         TEXT,
  tax_no                TEXT,
  amount                REAL,
  tax_amount            REAL,
  invoice_date          TEXT,
  category_code         TEXT,
  category_l1           TEXT,
  category_l2           TEXT,
  confidence            REAL,
  raw_text              TEXT,
  reason                TEXT,
  is_manual_corrected   INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  invoice_code          TEXT,
  invoice_no            TEXT,
  invoice_fingerprint   TEXT,
  fingerprint_strength  TEXT,
  duplicate_of          TEXT,
  verify_status         TEXT,
  verify_detail         TEXT,
  verify_checked_at     TEXT,
  -- 供应商对账单拆出来的行号，从 1 开始；单张小票恒为 1。
  -- 线上库是后加的列，迁移脚本见 db/migrations/2026-11-01-line-no.sql
  line_no               INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_invoice_records_project_id ON invoice_records(project_id);
CREATE INDEX IF NOT EXISTS ix_invoice_records_user_id    ON invoice_records(user_id);
CREATE INDEX IF NOT EXISTS ix_invoice_records_file_id    ON invoice_records(file_id);
-- 对账单按文件取明细并按行号排序，走这条索引
CREATE INDEX IF NOT EXISTS ix_invoice_records_file_line  ON invoice_records(file_id, line_no);
CREATE INDEX IF NOT EXISTS ix_invoice_records_invoice_no ON invoice_records(invoice_no);
CREATE INDEX IF NOT EXISTS ix_invoice_records_fingerprint ON invoice_records(invoice_fingerprint);
-- 报表与筛选最常用的组合（项目 + 方向 + 日期），避免全表扫
CREATE INDEX IF NOT EXISTS ix_invoice_records_report
  ON invoice_records(project_id, direction, invoice_date);

-- ---------------------------------------------------------------- 积分
CREATE TABLE IF NOT EXISTS quota_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  delta       INTEGER NOT NULL,
  reason      TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_quota_logs_user_id ON quota_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_quota_logs_user_action_time
  ON quota_logs(user_id, action, created_at);

-- ---------------------------------------------------------------- 套餐与订单
CREATE TABLE IF NOT EXISTS plans (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  quota          INTEGER NOT NULL DEFAULT 0,
  price_cents    INTEGER NOT NULL DEFAULT 0,
  features       TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL,
  project_limit  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code       TEXT NOT NULL,
  amount_cents    INTEGER NOT NULL,
  transaction_id  TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  paid_at         TEXT,
  created_at      TEXT NOT NULL,
  period_months   INTEGER NOT NULL DEFAULT 1,
  -- 币种与支付渠道。金额单位随币种走：CNY 是分，USD 是美分。
  -- 不存符号也不存小数，避免浮点误差带进支付金额。
  currency        TEXT NOT NULL DEFAULT 'CNY',
  -- wechat / stripe / paypal
  provider        TEXT NOT NULL DEFAULT 'wechat'
);
CREATE INDEX IF NOT EXISTS ix_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS ix_orders_transaction ON orders(transaction_id);

-- ---------------------------------------------------------------- 营业额
--
-- 每天一行营业额，用来算毛利。同一天重复提交按覆盖处理：
-- 用户改错数字时应该改当天，而不是再多出一条。
CREATE TABLE IF NOT EXISTS daily_sales (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- 定长 YYYY-MM-DD，按月取数用 substr(sale_date, 1, 7) 比较
  sale_date   TEXT NOT NULL,
  amount      REAL NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_daily_sales_project_date ON daily_sales(project_id, sale_date);
CREATE INDEX IF NOT EXISTS ix_daily_sales_user ON daily_sales(user_id, sale_date);

-- ---------------------------------------------------------------- 报表快照
CREATE TABLE IF NOT EXISTS report_snapshots (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL DEFAULT 1,
  summary      TEXT,
  detail_json  TEXT,
  share_token  TEXT UNIQUE,
  status       TEXT NOT NULL DEFAULT 'draft',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_report_snapshots_project ON report_snapshots(project_id);
CREATE INDEX IF NOT EXISTS ix_report_snapshots_share ON report_snapshots(share_token);

-- ---------------------------------------------------------------- 会计合作
--
-- 每位合作的会计拿一个短码，自己转发给客户。注册时把码记进 referrals，
-- 之后按这个码统计「带来了几个注册、几个付费」。
-- 码不可改：改码等于让已经发出去的链接和已记录的归因断掉。
CREATE TABLE IF NOT EXISTS partners (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  contact     TEXT,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_partners_status ON partners(status);

CREATE TABLE IF NOT EXISTS referrals (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  partner_code  TEXT NOT NULL,
  source        TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_referrals_partner ON referrals(partner_code, created_at);

-- 注册来源。每个用户一行，注册时写一次。
-- 与 referrals 分开：会计推荐码回答「谁带来的」，这张表回答「哪个渠道带来的」。
CREATE TABLE IF NOT EXISTS signup_sources (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,
  medium      TEXT,
  campaign    TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_signup_sources_source ON signup_sources(source, created_at);

-- ---------------------------------------------------------------- 邮箱验证码
--
-- 注册前先证明邮箱是真实可收信的。只存验证码的哈希，不存明文：
-- 库被拖走也换不回能用的验证码。
--
-- ip_hash 存的是 IP 加服务端密钥的哈希，只用来按来源限流，不留原始 IP。
CREATE TABLE IF NOT EXISTS email_verifications (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  ip_hash     TEXT,
  -- 输错次数，超过上限就作废，避免六位数字被暴力穷举
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_email_verifications_email ON email_verifications(email, created_at);
CREATE INDEX IF NOT EXISTS ix_email_verifications_ip ON email_verifications(ip_hash, created_at);

-- ---------------------------------------------------------------- 登录失败记录
--
-- 登录接口如果完全不限流，密码就等于交给脚本去猜。这里按邮箱和来源 IP
-- 各留一份失败流水：同一邮箱连续失败超过阈值就冷却一段时间，成功登录后清掉。
-- 只存 IP 的哈希，不留原始地址。
CREATE TABLE IF NOT EXISTS login_attempts (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  ip_hash    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_login_attempts_email ON login_attempts(email, created_at);
CREATE INDEX IF NOT EXISTS ix_login_attempts_ip ON login_attempts(ip_hash, created_at);

-- ---------------------------------------------------------------- 接口用量
--
-- OCR 与 AI 接口每调一次都要付服务商的钱，而积分是在「入账」时才扣，
-- 识别本身不限次。这里按用户和动作记调用流水，一小时超过上限就拒绝，
-- 表里不留长期历史。
CREATE TABLE IF NOT EXISTS api_usage (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  action     TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_api_usage_user ON api_usage(user_id, action, created_at);

-- ---------------------------------------------------------------- 付费意向
--
-- 支付通道还没接完时，Pro 的购买入口改成「留邮箱，开通后通知」。
-- 同一个邮箱对同一个套餐只留一行，重复提交不会堆数据。
CREATE TABLE IF NOT EXISTS plan_interest (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  plan_code   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  -- 开通后发过通知就写上时间，避免同一个人收到第二封
  notified_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_plan_interest_email_plan ON plan_interest(email, plan_code);
