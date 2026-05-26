"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/actions/project-actions";
import PageHeader from "@/components/page-header";
import TabBar from "@/components/tab-bar";

interface Project {
  id: string;
  name: string;
  industry: string;
  createdAt: Date;
  _count: { records: number };
}

export default function HomeClient({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const project = await createProject(newName.trim());
      setShowCreate(false);
      setNewName("");
      router.push(`/project/${project.id}`);
    } catch {
      alert("创建失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="pb-16">
      <PageHeader title="票小助" />

      <div className="px-4 -mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#333333]">我的项目</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-brand text-white text-sm px-4 py-1.5 rounded-xl"
          >
            + 新建
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white rounded-md p-8 shadow-card text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm text-[#999999]">暂无项目，点击上方新建</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-md p-4 shadow-card cursor-pointer active:bg-gray-50"
                onClick={() => router.push(`/project/${p.id}`)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#333333]">{p.name}</span>
                  <span className="text-xs text-[#999999]">
                    {p._count.records} 条记录
                  </span>
                </div>
                <p className="text-xs text-[#999999] mt-1">
                  {new Date(p.createdAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6">
          <div className="bg-white rounded-lg p-6 w-full shadow-card">
            <h3 className="text-base font-semibold mb-4">新建项目</h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none mb-4"
              placeholder="项目名称"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewName("");
                }}
                className="flex-1 border border-[#EEEEEE] py-2 rounded-xl text-sm"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex-1 bg-brand text-white py-2 rounded-xl text-sm disabled:opacity-50"
              >
                {creating ? "创建中..." : "确定"}
              </button>
            </div>
          </div>
        </div>
      )}

      <TabBar />
    </div>
  );
}
