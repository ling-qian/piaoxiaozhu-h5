"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { recognizeImage } from "@/lib/ocr";
import { createRecordFromOcr } from "@/lib/actions/record-actions";
import { checkQuota } from "@/lib/actions/user-actions";
import { getProjects } from "@/lib/actions/project-actions";
import { useToast } from "@/components/toast";
import PageHeader from "@/components/page-header";
import OcrProgress from "@/components/ocr-progress";

interface ProjectOption {
  id: string;
  name: string;
}

interface BatchItem {
  id: string;
  file: File;
  preview: string;
  status: "pending" | "recognizing" | "saving" | "done" | "error";
  progress: number;
  error?: string;
}

function UploadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("project") || "";
  const { showToast } = useToast();

  const [projectId, setProjectId] = useState(urlProjectId);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!urlProjectId) {
      getProjects().then((list) => {
        setProjects(list.map((p) => ({ id: p.id, name: p.name })));
        if (list.length > 0 && !projectId) {
          setProjectId(list[0].id);
        }
      });
    }
  }, [urlProjectId, projectId]);

  function addFiles(files: FileList | File[]) {
    const newItems: BatchItem[] = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        preview: URL.createObjectURL(f),
        status: "pending" as const,
        progress: 0,
      }));
    if (newItems.length === 0) {
      showToast("请选择图片文件", "error");
      return;
    }
    setBatchItems((prev) => [...prev, ...newItems]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
    // 重置 input 以便再次选择相同文件
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeItem(id: string) {
    setBatchItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  }

  function clearAll() {
    batchItems.forEach((item) => URL.revokeObjectURL(item.preview));
    setBatchItems([]);
  }

  async function handleBatchRecognize() {
    if (batchItems.length === 0) return;
    if (!projectId) {
      showToast("请先选择项目", "error");
      return;
    }

    try {
      const quota = await checkQuota();
      if (!quota.available) {
        showToast("识别次数已用完，请升级套餐", "error");
        return;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "配额检查失败";
      showToast(message, "error");
      return;
    }

    setProcessing(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const pendingItems = batchItems.filter((i) => i.status === "pending" || i.status === "error");
    let successCount = 0;
    let failCount = 0;

    for (const item of pendingItems) {
      if (controller.signal.aborted) break;

      // 更新状态为识别中
      setBatchItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "recognizing" as const, progress: 0 } : i))
      );

      try {
        const result = await recognizeImage(
          item.file,
          (p) => {
            setBatchItems((prev) =>
              prev.map((i) => (i.id === item.id ? { ...i, progress: p } : i))
            );
          },
          controller.signal
        );

        // 保存
        setBatchItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "saving" as const } : i))
        );

        const record = await createRecordFromOcr(projectId, result.rawText, item.file);

        if ((record as Record<string, unknown>)._imageUploadFailed) {
          // 图片上传失败但记录已保存
        }

        setBatchItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "done" as const, progress: 100 } : i))
        );
        successCount++;
      } catch (err: unknown) {
        const message = controller.signal.aborted ? "已取消" : (err instanceof Error ? err.message : "识别失败");
        setBatchItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "error" as const, error: message } : i))
        );
        failCount++;
      }
    }

    setProcessing(false);
    abortRef.current = null;

    if (controller.signal.aborted) {
      showToast("批量识别已取消", "info");
    } else if (failCount === 0) {
      showToast(`${successCount} 张票据识别完成`, "success");
    } else {
      showToast(`完成 ${successCount} 张，失败 ${failCount} 张`, "info");
    }
  }

  const pendingCount = batchItems.filter((i) => i.status === "pending" || i.status === "error").length;
  const doneCount = batchItems.filter((i) => i.status === "done").length;
  const allDone = batchItems.length > 0 && doneCount === batchItems.length;

  return (
    <div className="pb-20">
      <PageHeader title="票据上传" showBack onBack={() => router.back()} />

      <div className="px-4 -mt-4 space-y-4">
        {!urlProjectId && projects.length > 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <label className="text-sm text-[#666666] mb-1.5 block">选择项目</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm bg-white text-[#333333] focus:border-brand focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {!urlProjectId && projects.length === 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up text-center">
            <p className="text-sm text-[#999999]">暂无项目，请先创建项目</p>
            <button
              onClick={() => router.push("/")}
              className="text-sm text-brand mt-2 btn-press"
            >
              去创建 →
            </button>
          </div>
        )}

        {/* 图片列表 */}
        {batchItems.length > 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-[#666666]">
                已选 {batchItems.length} 张 {doneCount > 0 && `(完成 ${doneCount})`}
              </span>
              {!processing && (
                <button onClick={clearAll} className="text-xs text-error btn-press">
                  清空
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {batchItems.map((item) => (
                <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-50">
                  <Image
                    src={item.preview}
                    alt="预览"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {/* 状态覆盖层 */}
                  {item.status === "recognizing" && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-1" />
                      <span className="text-white text-xs">{item.progress}%</span>
                    </div>
                  )}
                  {item.status === "saving" && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-white text-xs">保存中...</span>
                    </div>
                  )}
                  {item.status === "done" && (
                    <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                      <span className="text-white text-lg">✓</span>
                    </div>
                  )}
                  {item.status === "error" && (
                    <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                      <span className="text-white text-lg">✕</span>
                    </div>
                  )}
                  {/* 删除按钮 */}
                  {!processing && item.status !== "recognizing" && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              {/* 添加更多按钮 */}
              {!processing && (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="aspect-square border-2 border-dashed border-[#EEEEEE] rounded-lg flex flex-col items-center justify-center active:border-brand transition-colors"
                >
                  <span className="text-2xl text-[#CCCCCC]">+</span>
                  <span className="text-[10px] text-[#CCCCCC]">添加</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 空状态 - 上传区域 */}
        {batchItems.length === 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up stagger-1">
            <div
              onClick={() => inputRef.current?.click()}
              className="w-full h-64 border-2 border-dashed border-[#EEEEEE] rounded-md flex flex-col items-center justify-center cursor-pointer active:border-brand transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#CCCCCC" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mb-2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <p className="text-sm text-[#999999]">点击拍照或选择图片</p>
              <p className="text-xs text-[#CCCCCC] mt-1">支持多选，JPG、PNG 格式</p>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* 操作按钮 */}
        <div className="flex gap-3 animate-fade-in-up stagger-2">
          {batchItems.length === 0 ? (
            <button
              onClick={() => inputRef.current?.click()}
              className="flex-1 bg-brand text-white py-3 rounded-xl font-medium btn-press"
            >
              拍照/选图
            </button>
          ) : processing ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="flex-1 bg-red-500 text-white py-3 rounded-xl font-medium btn-press"
            >
              取消识别
            </button>
          ) : allDone ? (
            <button
              onClick={() => router.push(`/project/${projectId}`)}
              className="flex-1 bg-brand text-white py-3 rounded-xl font-medium btn-press"
            >
              查看项目记录
            </button>
          ) : (
            <button
              onClick={handleBatchRecognize}
              disabled={pendingCount === 0 || !projectId}
              className="flex-1 bg-brand text-white py-3 rounded-xl font-medium disabled:opacity-50 btn-press"
            >
              开始识别 ({pendingCount} 张)
            </button>
          )}
        </div>

        <div className="bg-brand-bg rounded-md p-4 animate-fade-in-up stagger-3">
          <p className="text-xs text-[#666666] leading-relaxed">
            💡 提示：支持多张票据同时上传。请确保票据清晰可见，避免反光和遮挡。
          </p>
        </div>
      </div>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-[3px] border-brand/20 border-t-brand rounded-full animate-spin" /></div>}>
      <UploadContent />
    </Suspense>
  );
}
