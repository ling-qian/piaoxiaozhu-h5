/**
 * OpenNext 在 Cloudflare 上的构建配置。
 *
 * 保持默认即可：这个应用没有用 ISR、没有用 PPR，也没有需要单独缓存的增量数据。
 * 等以后真的加了 ISR，再在这里接 R2 或 KV 做缓存层。
 */
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
