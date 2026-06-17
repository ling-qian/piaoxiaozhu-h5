import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { STRIPE_WEBHOOK_SECRET } from "@/lib/env";

const PLAN_QUOTA: Record<string, number> = {
  pro: 100,
  enterprise: 999999,
};

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
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const planCode = session.metadata?.planCode;

        if (userId && planCode && PLAN_QUOTA[planCode]) {
          await prisma.user.update({
            where: { id: userId as string },
            data: {
              planCode: planCode as string,
              quotaTotal: PLAN_QUOTA[planCode],
              quotaUsed: 0,
            },
          });
        }
        break;
      }

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

      // 发票支付失败 — 降级到免费版
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;

        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
        });

        if (user && user.planCode !== "free") {
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

      // 订阅信息更新（如 plan 变更）
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        const status = subscription.status;

        if (status === "active" || status === "trialing") {
          // 尝试从 metadata 获取 userId，或从 customer ID 查用户
          const userId = subscription.metadata?.userId;
          if (userId) {
            // 从 price_id 反推 planCode
            const priceId = subscription.items?.data?.[0]?.price?.id;
            const { STRIPE_PRO_PRICE_ID, STRIPE_ENTERPRISE_PRICE_ID } = await import("@/lib/env");
            let planCode = "pro";
            if (STRIPE_ENTERPRISE_PRICE_ID && priceId === STRIPE_ENTERPRISE_PRICE_ID) {
              planCode = "enterprise";
            } else if (STRIPE_PRO_PRICE_ID && priceId === STRIPE_PRO_PRICE_ID) {
              planCode = "pro";
            }

            const quota = PLAN_QUOTA[planCode];
            if (quota) {
              await prisma.user.update({
                where: { id: userId },
                data: {
                  planCode,
                  quotaTotal: quota,
                  quotaUsed: 0,
                },
              });
            }
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error("[Stripe Webhook] Processing error:", err);
    // 即使处理失败也返回 200，避免 Stripe 反复重试
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
