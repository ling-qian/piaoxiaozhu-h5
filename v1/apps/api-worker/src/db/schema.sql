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
  verify_checked_at     TEXT
);
CREATE INDEX IF NOT EXISTS ix_invoice_records_project_id ON invoice_records(project_id);
CREATE INDEX IF NOT EXISTS ix_invoice_records_user_id    ON invoice_records(user_id);
CREATE INDEX IF NOT EXISTS ix_invoice_records_file_id    ON invoice_records(file_id);
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
  period_months   INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS ix_orders_transaction ON orders(transaction_id);

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
