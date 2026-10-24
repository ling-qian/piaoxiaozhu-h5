/** Worker 运行时绑定。新增 secret 时同步在这里加字段，避免到处 as any。 */
export interface Env {
  DB: D1Database;

  JWT_SECRET: string;
  JWT_ALGORITHM: string;
  ADMIN_TOKEN?: string;

  APP_ENV: string;

  WX_APPID?: string;
  WX_SECRET?: string;

  COS_SECRET_ID?: string;
  COS_SECRET_KEY?: string;
  COS_REGION?: string;
  COS_BUCKET_NAME?: string;

  // ── 微信支付 V3 ──
  WX_MCH_ID?: string;
  /** 商户证书序列号（不是证书本身） */
  WX_CERT_SERIAL_NO?: string;
  /** 商户私钥 PEM 全文（apiclient_key.pem 的内容） */
  WX_PRIVATE_KEY_PEM?: string;
  /** APIv3 密钥，32 字节；回调里的 resource 用它解密 */
  WX_API_KEY?: string;
  /** 支付结果回调地址，必须公网可达 */
  WX_NOTIFY_URL?: string;
  /** 微信支付平台公钥（PUBLIC KEY PEM）或平台证书（CERTIFICATE PEM） */
  WX_PLATFORM_PUBLIC_KEY?: string;

  LLM_BASE_URL: string;
  LLM_API_KEY?: string;
  LLM_MODEL_NAME: string;

  /** OCR 容器地址。Worker 不跑 OCR，转发给它。 */
  OCR_SERVICE_URL?: string;
}
