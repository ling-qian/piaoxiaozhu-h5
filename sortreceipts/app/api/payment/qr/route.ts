import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { WECHAT_PAY_QR_URL, ALIPAY_QR_URL, STRIPE_SECRET_KEY } from "@/lib/env";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  return NextResponse.json({
    wechatPayQrUrl: WECHAT_PAY_QR_URL,
    alipayQrUrl: ALIPAY_QR_URL,
    hasStripe: !!STRIPE_SECRET_KEY,
  });
}
