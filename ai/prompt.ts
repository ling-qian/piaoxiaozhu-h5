import { Category, Field, Project } from "@/prisma/client"

export function buildLLMPrompt(
  promptTemplate: string,
  fields: Field[],
  categories: Category[] = [],
  projects: Project[] = []
) {
  let prompt = promptTemplate

  prompt = prompt.replace(
    "{fields}",
    fields
      .filter((field) => field.llm_prompt)
      .map((field) => `- ${field.code}: ${field.llm_prompt}`)
      .join("\n")
  )

  prompt = prompt.replace(
    "{categories}",
    categories.length > 0
      ? categories
          .filter((category) => category.llm_prompt)
          .map((category) => `- ${category.code}: for ${category.llm_prompt}`)
          .join("\n")
      : "No categories configured"
  )

  prompt = prompt.replace(
    "{projects}",
    projects.length > 0
      ? projects
          .filter((project) => project.llm_prompt)
          .map((project) => `- ${project.code}: for ${project.llm_prompt}`)
          .join("\n")
      : "No projects configured"
  )

  prompt = prompt.replace(
    "{categories.code}",
    categories.length > 0 ? categories.map((category) => `${category.code}`).join(", ") : "none"
  )
  prompt = prompt.replace(
    "{projects.code}",
    projects.length > 0 ? projects.map((project) => `${project.code}`).join(", ") : "none"
  )

  return prompt
}
