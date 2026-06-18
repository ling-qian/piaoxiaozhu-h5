import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STRIPE_SECRET_KEY } from "@/lib/env";

const PLAN_CONFIG: Record<string, { price: number; name: string; quotaTotal: number }> = {
  pro: { price: 2900, name: "专业版", quotaTotal: 100 },         // 29元 = 2900分
  enterprise: { price: 9900, name: "企业版", quotaTotal: 999999 }, // 99元 = 9900分
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await req.json();
  const { planCode, payMethod } = body;

  if (!planCode || !PLAN_CONFIG[planCode]) {
    return NextResponse.json({ error: "无效的套餐" }, { status: 400 });
  }

  try {
    // 如果配置了 Stripe，走 Stripe 一次性支付流程（支持支付宝/微信/信用卡）
    if (STRIPE_SECRET_KEY) {
      const { getStripe } = await import("@/lib/stripe");
      const { NEXT_PUBLIC_BASE_URL } = await import("@/lib/env");

      const planConfig = PLAN_CONFIG[planCode];
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

      // 根据用户选择的支付方式决定 payment_method_types
      const paymentMethodTypes: ("card" | "alipay" | "wechat_pay")[] = ["card"];
      if (payMethod === "alipay") {
        paymentMethodTypes.push("alipay");
      } else if (payMethod === "wechat") {
        paymentMethodTypes.push("wechat_pay");
      } else {
        // 默认全部展示
        paymentMethodTypes.push("alipay", "wechat_pay");
      }

      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        payment_method_types: paymentMethodTypes,
        line_items: [
          {
            price_data: {
              currency: "cny",
              product_data: {
                name: planConfig.name,
                description: `${planConfig.name}月度订阅`,
              },
              unit_amount: planConfig.price,
            },
            quantity: 1,
          },
        ],
        success_url: `${NEXT_PUBLIC_BASE_URL}/member?success=1&plan=${planCode}`,
        cancel_url: `${NEXT_PUBLIC_BASE_URL}/member?cancel=1`,
        metadata: { userId, planCode },
      });

      return NextResponse.json({ url: checkoutSession.url });
    }

    // 未配置 Stripe：提交升级审核请求（人工审核模式）
    const existing = await prisma.planUpgradeRequest.findFirst({
      where: { userId, planCode, status: "pending" },
    });
    if (existing) {
      return NextResponse.json({ error: "您已有待审核的升级请求，请耐心等待" }, { status: 400 });
    }

    const request = await prisma.planUpgradeRequest.create({
      data: {
        userId,
        planCode,
        payMethod: payMethod || "wechat",
      },
    });

    return NextResponse.json({ success: true, requestId: request.id, status: "pending" });
  } catch (err) {
    console.error("[Checkout] Error:", err);
    return NextResponse.json({ error: "提交失败，请重试" }, { status: 500 });
  }
}
