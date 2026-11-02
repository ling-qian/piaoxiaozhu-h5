/**
 * `/llms-full.txt`：整篇指南与问答的纯文本。
 *
 * `llms.txt` 是目录，这一份是正文。两者分开的理由是目录要短，
 * 而想让 AI 直接摄取全文的客户端需要一次拿到所有段落。
 *
 * 正文从 `app/guide/content.ts` 生成，不另存一份手写副本：
 * 页面上改了一段，这里跟着变，不会出现两个版本互相矛盾。
 */

import { DOC_UPDATED, guidePlainText } from "@/app/guide/content";

export const dynamic = "force-static";

export function GET() {
  const body = [
    `Source: https://sortreceipts.qianling-tech.top/guide`,
    `中文版: https://sortreceipts.qianling-tech.top/zh/guide`,
    `Last updated: ${DOC_UPDATED}`,
    "",
    guidePlainText("en"),
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
