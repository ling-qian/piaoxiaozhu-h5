/** Worker 运行时绑定。新增 secret 时同步在这里加字段，避免到处 as any。 */
export interface Env {
  DB: D1Database;

  JWT_SECRET: string;
  JWT_ALGORITHM: string;
  ADMIN_TOKEN?: string;

  APP_ENV: string;

  /**
   * 部署区域：`cn`（默认）或 `intl`。
   *
   * 只有 `intl` 会关闭微信登录接口。不配按国内处理——
   * 配置缺失时宁可多暴露一个没人用的接口，也不能让国内用户登不进来。
   */
  REGION?: string;

  /** OCR 服务的共享密钥，随 X-OCR-Key 头发给识别服务 */
  OCR_API_KEY?: string;

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

  // ── 境外支付 ──
  /** Stripe 密钥（sk_live_ / sk_test_）。为空表示未开通 */
  STRIPE_SECRET_KEY?: string;
  /** Stripe 回调验签密钥（whsec_）。缺了就无法确认回调真实性 */
  STRIPE_WEBHOOK_SECRET?: string;

  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  /** sandbox 或 live。非法值按 sandbox 处理，避免误扣真钱 */
  PAYPAL_ENV?: string;

  // ── 注册安全 ──
  /** Resend 的 API Key。为空表示邮件服务未开通，验证码发不出去 */
  RESEND_API_KEY?: string;
  /** 发件人，形如 `SortReceipts <no-reply@example.com>`，域名必须在 Resend 里验证过 */
  EMAIL_FROM?: string;
  /** Cloudflare Turnstile 的 Secret Key。为空表示人机验证未配置 */
  TURNSTILE_SECRET_KEY?: string;

  /**
   * 站点对外地址，用于支付成功/取消后的跳转。
   * Stripe 要求 success_url 是绝对地址，不能传相对路径。
   */
  APP_BASE_URL?: string;

  LLM_BASE_URL: string;
  LLM_API_KEY?: string;
  LLM_MODEL_NAME: string;

  /** OCR 容器地址。Worker 不跑 OCR，转发给它。 */
  OCR_SERVICE_URL?: string;
}
