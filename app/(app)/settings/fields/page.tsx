import { addFieldAction, deleteFieldAction, editFieldAction } from "@/app/(app)/settings/actions"
import { CrudTable } from "@/components/settings/crud"
import { getCurrentUser } from "@/lib/auth"
import { getFields } from "@/models/fields"
import { Prisma } from "@/prisma/client"

export default async function FieldsSettingsPage() {
  const user = await getCurrentUser()
  const fields = await getFields(user.id)
  const fieldsWithActions = fields.map((field) => ({
    ...field,
    isEditable: true,
    isDeletable: field.isExtra,
  }))

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2">自定义字段</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-prose">
        您可以为交易添加新字段。标准字段无法删除，但可以调整其提示词或隐藏。如果您不希望某个字段被 AI
        分析而是手动填写，请将"LLM 提示词"留空。
      </p>
      <CrudTable
        items={fieldsWithActions}
        columns={[
          { key: "name", label: "名称", editable: true },
          {
            key: "type",
            label: "类型",
            type: "select",
            options: ["string", "number", "boolean"],
            defaultValue: "string",
            editable: true,
          },
          { key: "llm_prompt", label: "LLM 提示词", editable: true },
          {
            key: "isVisibleInList",
            label: "在交易表格中显示",
            type: "checkbox",
            defaultValue: false,
            editable: true,
          },
          {
            key: "isVisibleInAnalysis",
            label: "在分析表单中显示",
            type: "checkbox",
            defaultValue: false,
            editable: true,
          },
          {
            key: "isRequired",
            label: "是否必填",
            type: "checkbox",
            defaultValue: false,
            editable: true,
          },
        ]}
        onDelete={async (code) => {
          "use server"
          return await deleteFieldAction(user.id, code)
        }}
        onAdd={async (data) => {
          "use server"
          return await addFieldAction(user.id, data as Prisma.FieldCreateInput)
        }}
        onEdit={async (code, data) => {
          "use server"
          return await editFieldAction(user.id, code, data as Prisma.FieldUpdateInput)
        }}
      />
    </div>
  )
}
