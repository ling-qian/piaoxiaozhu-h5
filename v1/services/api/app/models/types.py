"""跨数据库的类型别名。

当前生产库是 **Neon（PostgreSQL）**，与本地 PG 同源，因此不需要方言适配。

保留 `GUID` 这一层间接引用，是为了让模型不直接依赖 `sqlalchemy.dialects.postgresql`
——万一将来切到 MySQL（TDSQL-C），SQLAlchemy 2.0 的通用 `Uuid` 会自动落成 CHAR(32)，
模型代码不需要再改一遍。

注意：**不要**在这里重定义时间类型。之前为 MySQL 写过一个「统一存 naive UTC」的
`UTCDateTime`，在 PostgreSQL 上会渲染成 `TIMESTAMP WITHOUT TIME ZONE`，
丢掉 timestamptz 的语义（签到日界、月度统计都会偏移）。PG 上直接用
`DateTime(timezone=True)`。
"""

from sqlalchemy import Uuid

# PG 上渲染为原生 uuid；换成 MySQL 时渲染为 CHAR(32)，双向转换由 as_uuid 负责
GUID = Uuid
