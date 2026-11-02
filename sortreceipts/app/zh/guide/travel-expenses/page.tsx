import { topicPageModule } from "@/app/guide/topic-page";

/** 主题子文：出差票据（中文）。路由固定，未知路径直接 404 */
const mod = topicPageModule("travel-expenses", "zh");

export const metadata = mod.metadata;
export default mod.Page;
