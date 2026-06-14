import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

const PLAN_CONFIG: Record<string, { priceId: string; quotaTotal: number }> = {
  pro: {
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    quotaTotal: 100,
  },
  enterprise: {
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID!,
    quotaTotal: 999999,
  },
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

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  try {
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
      line_items: [{ price: config.priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://piaoxiaozhu-h5.vercel.app"}/member?success=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || "https://piaoxiaozhu-h5.vercel.app"}/member?cancel=1`,
      metadata: { userId, planCode },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[Stripe Checkout] Error:", err);
    return NextResponse.json({ error: "创建支付会话失败" }, { status: 500 });
  }
}
