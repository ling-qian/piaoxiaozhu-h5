import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { HTML_LANG, LANDING_PATHS, ROOT_LOCALE, isLandingLocale } from "@/lib/locales";

/**
 * 访问控制。
 *
 * ## 为什么重写
 *
 * 这份中间件原来是 NextAuth 时代的遗留，用 `getToken` 去找 NextAuth 的会话 cookie。
 * 但登录早已改成自签 JWT，cookie 名是 `px_token`——NextAuth 那个 cookie 永远不会存在。
 *
 * 后果比「不生效」更糟：所有 `/api/*` 一律返回 401，所有页面一律跳登录页。
 * 用户填对密码登进来，跳回首页又被弹出去，形成死循环。
 *
 * ## 只检查 cookie 有没有，不验签
 *
 * 验签要在这里复制一份 JWT 密钥，而 Worker 对每个请求都会验，页面组件里的
 * `auth()` 也会验。中间件多做一层只是把同一个判断做三遍，还多一个密钥泄露面。
 *
 * 这里的作用是「别让匿名请求渲染页面」，不是「确认这个人是谁」。
 */

const TOKEN_COOKIE = "px_token";
/** 后台用独立令牌，和用户登录态分开，混用会把管理员踢下线 */
const ADMIN_COOKIE = "px_admin";
/** 会计推荐码：从 `?ref=` 或短链 `/r/CODE` 带进来，注册时一起提交 */
const REF_COOKIE = "px_ref";
const REF_MAX_AGE = 60 * 60 * 24 * 90;
/** 推广渠道：从 `utm_source` / `utm_medium` / `utm_campaign` 带进来，注册时写进渠道表 */
const SRC_COOKIE = "px_src";

/** 与后端 partners.ts 同一套规则：大写、4–12 位、不收纯数字 */
function normalizeRef(raw: string | null): string | null {
  const value = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(value) || /^\d+$/.test(value)) return null;
  return value;
}

/** 与后端 acquisition.ts 同一套规则：小写、只留字母数字与 . _ -、最长 40 */
function normalizeSrcValue(raw: string | null): string | null {
  const value = (raw ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return value ? value.slice(0, 40) : null;
}

/** 只有出现 utm_source 才记来源，避免空参数把上一段来源覆盖掉 */
function readSrc(sp: URLSearchParams): Record<string, string> | null {
  const source = normalizeSrcValue(sp.get("utm_source"));
  if (!source) return null;
  const src: Record<string, string> = { source };
  const medium = normalizeSrcValue(sp.get("utm_medium"));
  const campaign = normalizeSrcValue(sp.get("utm_campaign"));
  if (medium) src.medium = medium;
  if (campaign) src.campaign = campaign;
  return src;
}

function setSrcCookie(res: NextResponse, src: Record<string, string>) {
  // 三个值都过过 normalizeSrcValue，只含字母数字与 . _ -，用 | 拼接即可。
  // 不再套一层 encodeURIComponent：ResponseCookies 会再编码一次，读回来就对不上了。
  const value = [src.source, src.medium ?? "", src.campaign ?? ""].join("|");
  res.cookies.set(SRC_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REF_MAX_AGE,
    path: "/",
  });
}

function setRefCookie(res: NextResponse, code: string) {
  res.cookies.set(REF_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REF_MAX_AGE,
    path: "/",
  });
}

/** 公开路径（前缀匹配） */
const PUBLIC_PREFIXES = [
  "/auth/", // 登录、注册
  "/api/auth", // 登录接口本身
  "/api/admin/login", // 后台登录：校验令牌后自己写 cookie
  "/api/admin/logout",
  "/api/payments/stripe/webhook", // 支付回调靠签名验真，没有用户会话
  "/tessdata", // OCR 语言包
  // 月度交付包的只读分享：会计没有账号，凭令牌访问
  "/share/",
  // 主题子文带 slug，用前缀一次覆盖，新增一篇不必再来改中间件
  "/guide/",
  "/zh/guide/",
];

/**
 * 公开路径（精确匹配）。`/promo` 是推广落地页，必须让未登录的人看到。
 *
 * `/admin` 也放行：后台用独立令牌（`px_admin`），管理员不必是普通用户。
 * 页面组件自己判断有没有令牌（有 → 仪表盘，没有 → 令牌输入框）。
 * 不放行的话，未登录的管理员会被弹去用户登录页，永远进不了后台。
 * 接口侧仍由下面的 `/api/admin/` 分支和 Worker 的 ADMIN_TOKEN 双重把关。
 */
const PUBLIC_EXACT = [
  "/",
  "/promo",
  "/admin",
  // 内容页必须匿名可读：被弹去登录页的页面，爬虫只能看到一个 302
  "/guide",
  "/faq",
  "/zh/guide",
  "/zh/faq",
  "/about",
  "/zh/about",
  // 法务与联系页：推广渠道、支付审核、用户投诉都会直接访问，不能要求登录
  "/privacy",
  "/terms",
  "/contact",
  "/zh/privacy",
  "/zh/terms",
  "/zh/contact",
  ...LANDING_PATHS,
];

/**
 * 当前请求属于哪种语言，用 `<html lang>` 的格式返回。
 *
 * 语言页的路径是 `/es`、`/de` 这种单段地址；其余页面（工作台、登录页）
 * 一律按站点根语言处理，它们的界面文案由 i18n provider 自己决定。
 */
function localeHeaderValue(pathname: string): string {
  const segment = pathname.split("/")[1] ?? "";
  const locale = isLandingLocale(segment) && segment !== ROOT_LOCALE ? segment : ROOT_LOCALE;
  return HTML_LANG[locale];
}

/** 把语言带到根布局，`<html lang>` 才能逐页正确 */
function passThrough(req: NextRequest, pathname: string) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-locale", localeHeaderValue(pathname));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/**
 * 需要登录才能看的页面。
 *
 * 这里列受保护的路由，而不是「除公开路由外一律拦」。后者会把不存在的
 * 地址也送去登录页：爬虫抓一个坏链，拿到的是 307 而不是 404，
 * 既浪费抓取预算，也让人以为站点到处都要登录。
 */
const PROTECTED_PREFIXES = [
  "/analysis",
  "/ask",
  "/bill",
  "/checkin",
  "/member",
  "/mine",
  "/pack",
  "/points",
  "/project",
  "/quick-entry",
  "/report",
  "/result",
  "/sales",
  "/toolkit",
  "/upload",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 会计短链：/r/CODE → 首页带 ?ref，同时把码记进 cookie。
  // 单独处理而不是加进公开路径表，是为了让这一步本身就把归因落地。
  const short = /^\/r\/([A-Za-z0-9]{4,12})\/?$/.exec(pathname);
  if (short) {
    const code = short[1].toUpperCase();
    const res = NextResponse.redirect(new URL(`/?ref=${encodeURIComponent(code)}`, req.url));
    if (normalizeRef(code)) setRefCookie(res, code);
    return res;
  }

  const ref = normalizeRef(req.nextUrl.searchParams.get("ref"));
  const src = readSrc(req.nextUrl.searchParams);

  if (PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    const res = passThrough(req, pathname);
    if (ref) setRefCookie(res, ref);
    if (src) setSrcCookie(res, src);
    return res;
  }

  // 后台接口：看 px_admin，不是 px_token
  if (pathname.startsWith("/api/admin/")) {
    if (!req.cookies.get(ADMIN_COOKIE)?.value) {
      return NextResponse.json({ error: "未登录后台" }, { status: 401 });
    }
    return NextResponse.next();
  }

  const hasSession = !!req.cookies.get(TOKEN_COOKIE)?.value;

  if (pathname.startsWith("/api/")) {
    if (!hasSession) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!hasSession && isProtected(pathname)) {
    const loginUrl = new URL("/auth/login", req.url);
    // 带上原路径，登录后能回到用户本来想看的地方
    loginUrl.searchParams.set("callbackUrl", pathname);
    const res = NextResponse.redirect(loginUrl);
    // 匿名访问带 ref 或 UTM 的页面时先把来源存下来，注册仍然能归因
    if (ref) setRefCookie(res, ref);
    if (src) setSrcCookie(res, src);
    return res;
  }

  const res = passThrough(req, pathname);
  if (src) setSrcCookie(res, src);
  return res;
}

export const config = {
  // 静态资源不走访问控制。原先只排除 _next 和 icons，结果 /logo.svg、/og.png、
  // /manifest.json 也被弹去登录页——页面里的 <img> 拿到的是 HTML，图标显示不出来。
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)",
  ],
};
