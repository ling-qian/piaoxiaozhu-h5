import { NextRequest } from "next/server";

/**
 * 退订链接的入口。
 *
 * 邮件里的链接必须落在站点域名上，而退订逻辑在后端 Worker。这里只做转发，
 * 不改状态码也不改响应体——后端返回的是一张说明页，用户点完就看它。
 *
 * 没有这层转发，链接会落到 Next 的 404，用户会以为退订失败；
 * 而把邮件链接直接指向 api 域名又会让链接看起来像钓鱼。
 */
export async function GET(req: NextRequest) {
  const base = process.env.WORKER_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!base) return new Response("Not configured", { status: 500 });

  const target = new URL("/api/email/unsubscribe", base);
  req.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));

  const res = await fetch(target, { cache: "no-store" });
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "text/html; charset=utf-8" },
  });
}
