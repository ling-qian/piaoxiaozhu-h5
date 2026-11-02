-- 2026-11-01 给 invoice_records 加行号
--
-- 背景：供应商对账单一张图要拆成 N 条记录，它们共用一个 file_id。
-- 没有行号时只能按 created_at 排序，而同一批写入的时间戳会落在同一秒，
-- 顺序不确定，导出与复核都会看到乱序的明细。
--
-- 单张小票的行号恒为 1，所以已有数据加完列就是正确的，不需要回填。
-- 执行方式：
--   npx -y wrangler@3.114.0 d1 execute piaoxiaozhu --remote --file=src/db/migrations/2026-11-01-line-no.sql
-- 若 --file 报 fetch failed，改用 --command 逐条执行。

ALTER TABLE invoice_records ADD COLUMN line_no INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS ix_invoice_records_file_line ON invoice_records(file_id, line_no);
