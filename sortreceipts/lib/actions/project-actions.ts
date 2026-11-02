"use server";

/**
 * 项目相关数据操作。
 *
 * 已从 Prisma 直连改为调用 Cloudflare Worker 后端，
 * 但**导出函数名与返回形状保持不变**，页面 import 不用改。
 *
 * 兼容映射：
 *   Worker 的 `record_count`      → `_count.records`（原 Prisma 形状）
 *   Worker 的 `total_cost/income` → 同名透出
 */

import { revalidatePath } from "next/cache";

import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@/lib/auth";

interface ProjectResponse {
  id: string;
  user_id: string;
  customer_id: string | null;
  name: string;
  industry: string | null;
  report_month: string | null;
  status: string;
  created_at: string;
  record_count: number;
  total_cost: number;
  total_income: number;
}

/** 把后端返回的项目对象补上 Prisma 时代的字段形状 */
function toCompat(p: ProjectResponse) {
  return {
    id: p.id,
    userId: p.user_id,
    customerId: p.customer_id,
    name: p.name,
    // 页面类型是 string，而后端可能为 null —— 兜底成空串而不是把 null 漏出去
    industry: p.industry ?? "",
    reportMonth: p.report_month,
    status: p.status,
    // 页面类型是 Date，后端给的是 ISO 字符串 —— 在这里转换，
    // 免得每个页面都要记得 new Date(...)
    createdAt: new Date(p.created_at),
    record_count: p.record_count,
    total_cost: p.total_cost,
    total_income: p.total_income,
    // 原页面读的是 _count.records
    _count: { records: p.record_count },
  };
}

export async function getProjects() {
  const session = await auth();
  if (!session?.user) return [];

  const data = await apiFetch<{ items: ProjectResponse[] }>("/api/projects");
  return (data.items ?? []).map(toCompat);
}

export async function createProject(name: string, industry: string = "restaurant") {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  try {
    // 项目数量限制由后端按套餐校验（同一套规则，避免两端算出来不一致）
    const data = await apiFetch<ProjectResponse>("/api/projects", {
      method: "POST",
      body: { name, industry },
    });
    revalidatePath("/");
    return toCompat(data);
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) throw new Error(e.message);
    throw e;
  }
}

export async function updateProject(id: string, name: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  // 后端暂无独立改名接口。明确报错比静默成功好——静默会让用户以为改了，
  // 刷新后名字还是旧的，只能怀疑自己看错。
  throw new Error("暂不支持在网页端修改项目名称，请在 App 内修改");
}

export async function deleteProject(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  // 注意：原来是软删除（deletedAt），后端是物理删除 + 级联清记录。
  // 行为变化要接受——记录会一起消失。
  await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
  revalidatePath("/");
  revalidatePath(`/project/${id}`);
}

export async function getProjectById(id: string, userId: string) {
  // userId 仅为兼容旧签名；实际以登录态为准
  const session = await auth();
  if (!session?.user) return null;

  try {
    const data = await apiFetch<ProjectResponse>(`/api/projects/${id}`);
    return toCompat(data);
  } catch {
    return null;
  }
}

export async function getProjectStats(projectId: string) {
  const session = await auth();
  if (!session?.user) {
    // 返回零值而不是 null：页面类型是 Stats，返回 null 会让 TS 报错，
    // 也会让页面多一处无意义的空判断。未登录时本就不该看到数据。
    return { projectName: "", recordCount: 0, totalIncome: 0, totalExpense: 0, grossProfit: 0, costByCategory: [] };
  }

  const project = await apiFetch<ProjectResponse>(`/api/projects/${projectId}`);

  // 后端暂无「项目统计」聚合接口，这里用分页把记录全拉回来在内存里算。
  // 一个项目的记录量在几十到几百条，几个请求的开销可以接受；
  // 等记录量上来再改成后端聚合接口，避免提前抽象。
  const PAGE = 100;
  const byCategory = new Map<string, { code: string; name: string; amount: number }>();
  let totalIncome = 0;
  let totalExpense = 0;
  let page = 1;

  for (;;) {
    const data = await apiFetch<{
      items: Array<{ direction: string; amount: number | null; category_code: string | null; category_l1: string | null }>;
      total: number;
      page: number;
      size: number;
    }>(`/api/projects/${projectId}/records?page=${page}&size=${PAGE}`);

    for (const r of data.items ?? []) {
      const amount = Number(r.amount ?? 0);
      if (r.direction === "income") {
        totalIncome += amount;
      } else {
        totalExpense += amount;
        const name = r.category_l1 || "未分类";
        const code = r.category_code || name;
        const cur = byCategory.get(code) ?? { code, name, amount: 0 };
        cur.amount += amount;
        byCategory.set(code, cur);
      }
    }

    if (!data.items || data.items.length < PAGE) break;
    if (page * PAGE >= (data.total ?? 0)) break;
    page += 1;
    if (page > 20) break; // 兜底：异常分页时不要无限拉
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    projectName: project.name,
    recordCount: project.record_count,
    totalIncome: round(totalIncome),
    totalExpense: round(totalExpense),
    grossProfit: round(totalIncome - totalExpense),
    costByCategory: [...byCategory.values()]
      .map((c) => ({ ...c, amount: round(c.amount) }))
      .sort((a, b) => b.amount - a.amount),
  };
}
