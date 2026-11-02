/**
 * 部署区域。
 *
 * 同一套代码服务两个市场：国内版保留微信登录与微信支付，海外版完全不用微信。
 *
 * ## 默认为什么是「启用微信」
 *
 * `REGION` 不配时按国内处理，微信相关接口保持可用。
 *
 * 反过来（默认关）的风险更大：国内版如果忘了配 `REGION=cn`，
 * 用户点微信登录直接失败，进不去系统。而海外版多暴露一个没人调用的接口，
 * 只是表面问题——H5 海外版界面上根本没有微信入口。
 *
 * 所以配置缺失时往「功能可用」的方向倒，而不是往「安全」的方向倒。
 * 这里的安全性由接口自身的凭证校验兜底：没配 WX_APPID/WX_SECRET 时它会明确报错。
 */

export function isIntlDeployment(env: { REGION?: string }): boolean {
  return (env.REGION ?? "").trim().toLowerCase() === "intl";
}

/** 海外版拒绝微信接口时返回的统一提示 */
export const WECHAT_DISABLED_MESSAGE = "海外版不提供微信登录，请使用邮箱登录";
