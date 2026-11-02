-- 营业额与毛利：按天记一行，同一天覆盖写。
--
-- 唯一索引是「覆盖」的前提：没有它，同一天会积累出多条，毛利就被重复计了。
-- 索引名与 schema.sql 保持一致，本地与线上结构不能分叉。

CREATE TABLE IF NOT EXISTS daily_sales (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sale_date   TEXT NOT NULL,
  amount      REAL NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_daily_sales_project_date ON daily_sales(project_id, sale_date);
CREATE INDEX IF NOT EXISTS ix_daily_sales_user ON daily_sales(user_id, sale_date);
