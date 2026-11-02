/** 数据库行类型。字段名与 D1 列名一致（snake_case），不额外映射。 */

export interface UserRow {
  id: string;
  openid: string;
  unionid: string | null;
  phone: string | null;
  email: string | null;
  password_hash: string | null;
  nickname: string | null;
  avatar_url: string | null;
  plan_code: string;
  quota_total: number;
  quota_used: number;
  created_at: string;
  plan_expires_at: string | null;
  plan_remind_stage: string | null;
  plan_remind_expires_at: string | null;
  plan_remind_sent_at: string | null;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  customer_id: string | null;
  name: string;
  industry: string | null;
  report_month: string | null;
  status: string;
  created_at: string;
}

export interface InvoiceRecordRow {
  id: string;
  project_id: string;
  file_id: string | null;
  user_id: string;
  direction: string;
  merchant_name: string | null;
  tax_no: string | null;
  amount: number | null;
  tax_amount: number | null;
  invoice_date: string | null;
  category_code: string | null;
  category_l1: string | null;
  category_l2: string | null;
  confidence: number | null;
  raw_text: string | null;
  reason: string | null;
  is_manual_corrected: number;
  created_at: string;
  updated_at: string;
  invoice_code: string | null;
  invoice_no: string | null;
  invoice_fingerprint: string | null;
  fingerprint_strength: string | null;
  duplicate_of: string | null;
  verify_status: string | null;
  verify_detail: string | null;
  verify_checked_at: string | null;
  /** 对账单里的行号，单张小票恒为 1 */
  line_no: number;
}

export interface QuotaLogRow {
  id: string;
  user_id: string;
  action: string;
  delta: number;
  reason: string | null;
  created_at: string;
}

/** 项目 + 聚合（列表页一次查完，避免 N+1） */
export interface ProjectWithAggregates extends ProjectRow {
  record_count: number;
  total_cost: number;
  total_income: number;
}

/** 会计合作方。code 是主键，也是对外转发的推荐码 */
export interface PartnerRow {
  code: string;
  name: string;
  contact: string | null;
  note: string | null;
  status: string;
  created_at: string;
}

/** 注册归因：一个用户只记一次来源，后注册的覆盖没有意义 */
export interface ReferralRow {
  user_id: string;
  partner_code: string;
  source: string | null;
  created_at: string;
}

/** 每天一行营业额，唯一键是 (project_id, sale_date) */
export interface DailySaleRow {
  id: string;
  user_id: string;
  project_id: string;
  sale_date: string;
  amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}
