import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STRIPE_SECRET_KEY } from "@/lib/env";

const PLAN_CONFIG: Record<string, { quotaTotal: number }> = {
  pro: { quotaTotal: 100 },
  enterprise: { quotaTotal: 999999 },
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await req.json();
  const { planCode } = body;

  if (!planCode || !PLAN_CONFIG[planCode]) {
    return NextResponse.json({ error: "无效的套餐" }, { status: 400 });
  }

  const config = PLAN_CONFIG[planCode];

  try {
    // 如果配置了 Stripe，走 Stripe 支付流程
    if (STRIPE_SECRET_KEY) {
      const { getStripe } = await import("@/lib/stripe");
      const { STRIPE_PRO_PRICE_ID, STRIPE_ENTERPRISE_PRICE_ID, NEXT_PUBLIC_BASE_URL } = await import("@/lib/env");

      const PRICE_MAP: Record<string, string> = {
        pro: STRIPE_PRO_PRICE_ID,
        enterprise: STRIPE_ENTERPRISE_PRICE_ID,
      };

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json({ error: "用户不存在" }, { status: 404 });
      }

      const stripe = getStripe();
      let customerId = user.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: customerId },
        });
      }

      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: PRICE_MAP[planCode], quantity: 1 }],
        success_url: `${NEXT_PUBLIC_BASE_URL}/member?success=1`,
        cancel_url: `${NEXT_PUBLIC_BASE_URL}/member?cancel=1`,
        metadata: { userId, planCode },
      });

      return NextResponse.json({ url: checkoutSession.url });
    }

    // 未配置 Stripe：直接升级（开发/测试模式）
    await prisma.user.update({
      where: { id: userId },
      data: {
        planCode,
        quotaTotal: config.quotaTotal,
      },
    });

    return NextResponse.json({ success: true, planCode });
  } catch (err) {
    console.error("[Checkout] Error:", err);
    return NextResponse.json({ error: "升级失败，请重试" }, { status: 500 });
  }
}
