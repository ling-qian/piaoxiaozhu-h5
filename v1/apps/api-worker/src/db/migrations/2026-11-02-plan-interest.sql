-- 付费意向：支付未开通期间收集邮箱，开通后通知。
-- 与 schema.sql 中的定义保持一致。

CREATE TABLE IF NOT EXISTS plan_interest (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  plan_code   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  notified_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_plan_interest_email_plan ON plan_interest(email, plan_code);
