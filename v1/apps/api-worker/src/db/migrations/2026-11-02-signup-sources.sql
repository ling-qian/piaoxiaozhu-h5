-- 注册渠道归因：utm_source / utm_medium / utm_campaign。
--
-- 每个用户一行，注册时写一次；没有来源的注册记为 direct。
-- 可以重复执行。

CREATE TABLE IF NOT EXISTS signup_sources (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,
  medium      TEXT,
  campaign    TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_signup_sources_source ON signup_sources(source, created_at);
