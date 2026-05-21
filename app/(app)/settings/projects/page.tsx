import { addProjectAction, deleteProjectAction, editProjectAction } from "@/app/(app)/settings/actions"
import { CrudTable } from "@/components/settings/crud"
import { getCurrentUser } from "@/lib/auth"
import { randomHexColor } from "@/lib/utils"
import { getProjects } from "@/models/projects"
import { Prisma } from "@/prisma/client"

export default async function ProjectsSettingsPage() {
  const user = await getCurrentUser()
  const projects = await getProjects(user.id)
  const projectsWithActions = projects.map((project) => ({
    ...project,
    isEditable: true,
    isDeletable: true,
  }))

  return (
    <div className="container">
      <h1 className="text-2xl font-bold mb-2">项目</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-prose">
        使用项目来区分您不同类型的活动，例如：自由职业、YouTube 频道、博客。项目只是一种方便分离统计数据的方式。
      </p>
      <CrudTable
        items={projectsWithActions}
        columns={[
          { key: "name", label: "名称", editable: true },
          { key: "llm_prompt", label: "LLM 提示词", editable: true },
          { key: "color", label: "颜色", type: "color", defaultValue: randomHexColor(), editable: true },
        ]}
        onDelete={async (code) => {
          "use server"
          return await deleteProjectAction(user.id, code)
        }}
        onAdd={async (data) => {
          "use server"
          return await addProjectAction(user.id, data as Prisma.ProjectCreateInput)
        }}
        onEdit={async (code, data) => {
          "use server"
          return await editProjectAction(user.id, code, data as Prisma.ProjectUpdateInput)
        }}
      />
    </div>
  )
}
