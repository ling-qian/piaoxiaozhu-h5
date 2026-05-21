import { addCategoryAction, deleteCategoryAction, editCategoryAction } from "@/app/(app)/settings/actions"
import { CrudTable } from "@/components/settings/crud"
import { getCurrentUser } from "@/lib/auth"
import { randomHexColor } from "@/lib/utils"
import { getCategories } from "@/models/categories"
import { Prisma } from "@/prisma/client"

export default async function CategoriesSettingsPage() {
  const user = await getCurrentUser()
  const categories = await getCategories(user.id)
  const categoriesWithActions = categories.map((category) => ({
    ...category,
    isEditable: true,
    isDeletable: true,
  }))

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2">分类</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-prose">
        创建您自己的分类，以更好地反映您的收入和支出类型。定义 LLM 提示词，以便 AI 可以自动确定此分类。
      </p>

      <CrudTable
        items={categoriesWithActions}
        columns={[
          { key: "name", label: "名称", editable: true },
          { key: "llm_prompt", label: "LLM 提示词", editable: true },
          { key: "color", label: "颜色", type: "color", defaultValue: randomHexColor(), editable: true },
        ]}
        onDelete={async (code) => {
          "use server"
          return await deleteCategoryAction(user.id, code)
        }}
        onAdd={async (data) => {
          "use server"
          return await addCategoryAction(user.id, data as Prisma.CategoryCreateInput)
        }}
        onEdit={async (code, data) => {
          "use server"
          return await editCategoryAction(user.id, code, data as Prisma.CategoryUpdateInput)
        }}
      />
    </div>
  )
}
