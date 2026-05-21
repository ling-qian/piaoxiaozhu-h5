import { LoginForm } from "@/components/auth/login-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardTitle } from "@/components/ui/card"
import { ColoredText } from "@/components/ui/colored-text"
import config from "@/lib/config"
import { PLANS, stripeClient } from "@/lib/stripe"
import { createUserDefaults, isDatabaseEmpty } from "@/models/defaults"
import { getOrCreateCloudUser } from "@/models/users"
import { Cake, Ghost } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import Stripe from "stripe"

export default async function CloudPaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id: string }>
}) {
  const { session_id: sessionId } = await searchParams

  if (!stripeClient || !sessionId) {
    redirect(config.auth.loginUrl)
  }

  const session = await stripeClient.checkout.sessions.retrieve(sessionId)

  if (session.mode === "subscription" && session.status === "complete") {
    const subscription = (await stripeClient.subscriptions.retrieve(
      session.subscription as string
    )) as Stripe.Subscription

    const plan = Object.values(PLANS).find((p) => p.stripePriceId === subscription.items.data[0].price.id)
    const email = session.customer_details?.email || session.customer_email || ""
    const user = await getOrCreateCloudUser(email, {
      email: email,
      name: session.customer_details?.name || session.customer_details?.email || session.customer_email || "",
      stripeCustomerId: session.customer as string,
      membershipPlan: plan?.code,
      membershipExpiresAt: new Date(subscription.items.data[0].current_period_end * 1000),
      storageLimit: plan?.limits.storage,
      aiBalance: plan?.limits.ai,
    })

    return (
      <Card className="w-full max-w-xl mx-auto p-8 flex flex-col items-center justify-center gap-4">
        <Cake className="w-36 h-36" />
        <CardTitle className="text-3xl font-bold ">
          <ColoredText>支付成功</ColoredText>
        </CardTitle>
        <CardDescription className="text-center text-xl">
          欢迎使用票小猪，{user.name}。您现在可以登录您的账户了
        </CardDescription>
        <CardContent className="w-full">
          <LoginForm defaultEmail={user.email} />
        </CardContent>
      </Card>
    )
  } else {
    return (
      <Card className="w-full max-w-xl mx-auto p-8 flex flex-col items-center justify-center gap-4">
        <Ghost className="w-36 h-36" />
        <CardTitle className="text-3xl font-bold ">支付失败</CardTitle>
        <CardDescription className="text-center text-xl">请重试...</CardDescription>
        <CardFooter>
          <Button asChild>
            <Link href="/">返回首页</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }
}
