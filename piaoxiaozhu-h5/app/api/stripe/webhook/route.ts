import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { STRIPE_WEBHOOK_SECRET } from "@/lib/env";
import { PLANS } from "@/lib/plan-config";

const FREE_QUOTA_TOTAL = 10;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  const webhookSecret = STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // 一次性支付完成 → 立即升级套餐
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const planCode = session.metadata?.planCode;

        if (userId && planCode && PLANS[planCode] && session.mode === "payment") {
          await prisma.user.update({
            where: { id: userId as string },
            data: {
              planCode: planCode as string,
              quotaTotal: PLANS[planCode].aiQuota === -1 ? 999999 : PLANS[planCode].aiQuota,
              quotaUsed: 0,
            },
          });
          console.log(`[Stripe] Payment completed: user=${userId} plan=${planCode}`);
        }
        break;
      }

      // 订阅取消 → 降级到免费版（兼容旧订阅）
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              planCode: "free",
              quotaTotal: FREE_QUOTA_TOTAL,
            },
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error("[Stripe Webhook] Processing error:", err);
  }

  return NextResponse.json({ received: true });
}
