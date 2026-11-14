import { topicPageModule } from "@/app/guide/topic-page";

/** 主题子文：餐饮票据工具对比（中文）。路由固定，未知路径直接 404 */
const mod = topicPageModule("receipt-apps-compared", "zh");

export const metadata = mod.metadata;
export default mod.Page;
