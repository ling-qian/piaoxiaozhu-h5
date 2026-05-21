import Link from "next/link"

export function SubscriptionExpired() {
  return (
    <Link
      href="/settings/profile"
      className="w-full h-8 p-1 bg-red-500 text-white font-semibold text-center hover:bg-red-600 transition-colors"
    >
      您的订阅已过期。点击此处选择新的方案，否则您的账户将被删除。
    </Link>
  )
}
