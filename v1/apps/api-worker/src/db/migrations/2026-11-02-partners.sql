-- 会计合作：合作方短码与注册归因。
--
-- 不往 users 加列：归因只在新注册时写一次，单独一张表更清楚，
-- 也不会让 users 的 SELECT * 形状再变一次。
-- 两张表都能重复执行，不会因为多跑一次而报错。

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
