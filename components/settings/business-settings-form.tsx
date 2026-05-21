"use client"

import { saveProfileAction } from "@/app/(app)/settings/actions"
import { FormError } from "@/components/forms/error"
import { FormAvatar, FormInput, FormTextarea } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import { User } from "@/prisma/client"
import { CircleCheckBig } from "lucide-react"
import { useActionState } from "react"

export default function BusinessSettingsForm({ user }: { user: User }) {
  const [saveState, saveAction, pending] = useActionState(saveProfileAction, null)

  return (
    <div>
      <form action={saveAction} className="space-y-4">
        <FormInput
          title="企业名称"
          name="businessName"
          placeholder="示例公司"
          defaultValue={user.businessName ?? ""}
        />

        <FormTextarea
          title="企业地址"
          name="businessAddress"
          placeholder="街道、城市、省份、邮编、国家、税号"
          defaultValue={user.businessAddress ?? ""}
        />

        <FormTextarea
          title="银行信息"
          name="businessBankDetails"
          placeholder="银行名称、账号、BIC、IBAN、付款详情等"
          defaultValue={user.businessBankDetails ?? ""}
        />

        <FormAvatar
          title="企业标志"
          name="businessLogo"
          className="w-52 h-52"
          defaultValue={user.businessLogo ?? ""}
        />

        <div className="flex flex-row items-center gap-4">
          <Button type="submit" disabled={pending}>
            {pending ? "保存中..." : "保存"}
          </Button>
          {saveState?.success && (
            <p className="text-green-500 flex flex-row items-center gap-2">
              <CircleCheckBig />
              已保存！
            </p>
          )}
        </div>

        {saveState?.error && <FormError>{saveState.error}</FormError>}
      </form>
    </div>
  )
}
