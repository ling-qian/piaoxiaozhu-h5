import { topicPageModule } from "@/app/guide/topic-page";

/** 主题子文：餐饮票据工具对比（英文）。路由固定，未知路径直接 404 */
const mod = topicPageModule("receipt-apps-compared", "en");

export const metadata = mod.metadata;
export default mod.Page;
