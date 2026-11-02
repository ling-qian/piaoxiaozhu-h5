import { topicPageModule } from "@/app/guide/topic-page";

/** 主题子文：出差票据（英文）。路由固定，未知路径直接 404 */
const mod = topicPageModule("travel-expenses", "en");

export const metadata = mod.metadata;
export default mod.Page;
