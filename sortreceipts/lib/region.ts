/**
 * 地区配置。
 *
 * 同一套代码要服务两个市场，但有些东西不是翻译能解决的：
 *
 * - **中国增值税发票专有字段**（发票代码、校验码、买卖方税号）：欧美小票没有这些，
 *   识别出来是空的。留着一个空字段，用户会以为识别失败。
 *
 * - **每日签到领积分**：这是中国消费类应用的常见增长机制。欧美小企业用户对
 *   「每天来点一下领积分」接受度低，更像套路而不是价值。套餐自带的月度积分
 *   才是他们熟悉的形态。
 *
 * 用 `NEXT_PUBLIC_REGION=cn` 切回国内形态；不配或配成其它值时按海外处理，
 * 因为 H5 首发面向海外——配错了默认值应该落到目标市场，而不是反过来。
 */

export type Region = "cn" | "intl";

export const REGION: Region = process.env.NEXT_PUBLIC_REGION === "cn" ? "cn" : "intl";

export const IS_CN_REGION = REGION === "cn";

/**
 * 是否展示中国增值税发票专有字段。
 * 关掉后详情卡片只留：发票号、税率、不含税金额这些通用项。
 */
export const SHOW_CN_INVOICE_FIELDS = IS_CN_REGION;

/** 是否提供每日签到入口。海外版改用套餐月度积分 */
export const SHOW_CHECKIN = IS_CN_REGION;

/**
 * 是否提供微信登录入口。
 *
 * 国内版要，海外版不要。注意：H5 现在**只有邮箱密码登录**，
 * 微信登录只存在于小程序（靠 wx.login 拿 code）。网页端要做微信登录，
 * 得走公众号网页授权或开放平台扫码，是另一套实现，目前没有。
 *
 * 这个开关先留着，等国内版 H5 真要加微信登录时按它显示。
 * Worker 侧的 `/api/auth/wechat/login` 同样只在国内部署开放。
 */
export const SHOW_WECHAT_LOGIN = IS_CN_REGION;
