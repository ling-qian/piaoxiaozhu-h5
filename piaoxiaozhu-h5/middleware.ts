import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const secret = process.env.AUTH_SECRET;

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 公开页面：首页、工具箱、登录注册、auth API、Stripe webhook
  const publicPaths = ["/auth/login", "/auth/register", "/api/auth", "/api/stripe/webhook"];
  const publicExactPaths = ["/", "/toolkit"];
  if (publicPaths.some((p) => pathname.startsWith(p)) || publicExactPaths.includes(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret });

  if (pathname.startsWith("/api/")) {
    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons).*)"],
};