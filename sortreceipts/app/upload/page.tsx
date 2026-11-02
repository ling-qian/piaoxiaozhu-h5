"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
// recognizeImage (Tesseract.js) 已移除：中文票据识别效果极差
import { createRecordFromOcr } from "@/lib/actions/record-actions";
import { getProjects } from "@/lib/actions/project-actions";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n";
import PageHeader from "@/components/page-header";
import OcrProgress from "@/components/ocr-progress";
import TabBar from "@/components/tab-bar";

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

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_FILES = 20;

function UploadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("project") || "";
  const { showToast } = useToast();
  const { t } = useI18n();

  const [projectId, setProjectId] = useState(urlProjectId);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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
    const fileArray = Array.from(files);

    if (batchItems.length + fileArray.length > MAX_FILES) {
      showToast(`${t("upload.maxFiles").replace("{n}", String(MAX_FILES))}`, "error");
      return;
    }

    const newItems: BatchItem[] = [];
    for (const f of fileArray) {
      const isImage = f.type.startsWith("image/");
      const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      if (!isImage && !isPdf) {
        showToast(`"${f.name}" ${t("upload.notImage")}`, "error");
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        showToast(`"${f.name}" ${t("upload.overSize")}`, "error");
        continue;
      }
      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        preview: isPdf ? "" : URL.createObjectURL(f),
        status: "pending" as const,
        progress: 0,
      });
    }
    if (newItems.length === 0) return;
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
      showToast(t("upload.pleaseSelectProject"), "error");
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
        // 识别与入库合并一步：createRecordFromOcr 内部会调后端 OCR
        // （与小程序同一个 PaddleOCR 引擎），拿到字段后直接创建记录。
        //
        // 原来这里先自己 fetch("/api/ocr") 识别一遍，再把 file 传进去，
        // 而 createRecordFromOcr 内部又会识别一遍——同一张票识别两次，
        // 既慢一倍，也可能两次结果不一致。
        if (controller.signal.aborted) break;

        setBatchItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "recognizing" as const, progress: 40 } : i))
        );

        const record = await createRecordFromOcr(projectId, "", item.file);

        setBatchItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "done" as const, progress: 100 } : i))
        );
        successCount++;
      } catch (err: unknown) {
        const message = controller.signal.aborted ? t("common.cancelled") : (err instanceof Error ? err.message : t("upload.failed"));
        setBatchItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "error" as const, error: message } : i))
        );
        failCount++;
      }
    }

    setProcessing(false);
    abortRef.current = null;

    if (controller.signal.aborted) {
      showToast(t("upload.batchCancelled"), "info");
    } else if (failCount === 0) {
      showToast(`${successCount}${t("upload.batchComplete")}`, "success");
    } else {
      showToast(t("upload.batchResult").replace("{ok}", String(successCount)).replace("{fail}", String(failCount)), "info");
    }
  }

  const pendingCount = batchItems.filter((i) => i.status === "pending" || i.status === "error").length;
  const doneCount = batchItems.filter((i) => i.status === "done").length;
  const allDone = batchItems.length > 0 && doneCount === batchItems.length;

  return (
    <div className="pb-16 min-h-screen bg-[#F8FAFC] lg:pb-10">
      <PageHeader title={t("upload.title")} showBack onBack={() => router.back()} />

      <div className="px-4 pt-1 space-y-4 lg:mx-auto lg:max-w-3xl lg:px-10 lg:pt-6">
        {!urlProjectId && projects.length > 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <label className="text-sm text-[#475569] mb-2 block">{t("upload.selectProject")}</label>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProjectId(p.id)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    projectId === p.id ? "bg-brand text-white" : "bg-gray-100 text-[#475569] hover:bg-gray-200"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {!urlProjectId && projects.length === 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up text-center">
            <p className="text-sm text-[#64748B]">{t("upload.noProject")}</p>
            <button
              onClick={() => router.push("/")}
              className="text-sm text-brand mt-2 btn-press"
            >
              {t("upload.goCreate")}
            </button>
          </div>
        )}

        {/* 图片列表 */}
        {batchItems.length > 0 && (
          <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#475569]">
                {t("upload.selected")} {batchItems.length} {t("upload.countUnit")} {doneCount > 0 && `(${t("upload.done")} ${doneCount})`}
              </span>
              {!processing && (
                <button onClick={clearAll} className="text-xs text-error btn-press">
                  {t("upload.clear")}
                </button>
              )}
            </div>
            {/* 批量进度总览 */}
            {processing && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-brand font-medium">
                    {t("upload.progress")} {doneCount}/{batchItems.length}
                  </span>
                  <span className="text-xs text-[#64748B]">
                    {Math.round((doneCount / batchItems.length) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-[#F8FAFC] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand rounded-full transition-all duration-300"
                    style={{ width: `${(doneCount / batchItems.length) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              {batchItems.map((item) => (
                <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-50">
                  {item.preview ? (
                    <Image
                      src={item.preview}
                      alt={t("upload.select")}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-red-50">
                      <span className="text-3xl">📄</span>
                      <span className="text-xs text-red-400 mt-1 px-1 truncate w-full text-center">{item.file.name}</span>
                    </div>
                  )}
                  {/* 状态覆盖层 */}
                  {item.status === "recognizing" && (
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-1" />
                      <span className="text-white text-xs font-medium">{item.progress}%</span>
                    </div>
                  )}
                  {item.status === "saving" && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-white text-xs font-medium">{t("upload.saving")}</span>
                    </div>
                  )}
                  {item.status === "done" && (
                    <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {item.status === "error" && (
                    <div className="absolute inset-0 bg-red-500/30 flex flex-col items-center justify-center px-1">
                      <svg className="w-6 h-6 text-white mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {item.error && <span className="text-white text-[9px] leading-tight text-center">{item.error.slice(0, 12)}</span>}
                    </div>
                  )}
                  {/* 删除按钮 - 更大的触摸区域 */}
                  {!processing && item.status !== "recognizing" && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white text-xs active:bg-black/80"
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
                  className="aspect-square border-2 border-dashed border-[#DDDDDD] rounded-lg flex flex-col items-center justify-center active:border-brand active:bg-brand-bg transition-colors"
                >
                  <span className="text-2xl text-[#CBD5E1]">+</span>
                  <span className="text-[10px] text-[#CBD5E1] mt-0.5">{t("upload.add")}</span>
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
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length > 0) {
                  addFiles(e.dataTransfer.files);
                }
              }}
              className={`w-full min-h-[200px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                dragOver
                  ? "border-brand bg-brand-bg scale-[1.02]"
                  : "border-[#E2E8F0] active:border-brand"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke={dragOver ? "#2563EB" : "#CBD5E1"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mb-2 transition-colors">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <p className={`text-sm transition-colors ${dragOver ? "text-brand" : "text-[#64748B]"}`}>
                {dragOver ? t("upload.dragRelease") : t("upload.clickUpload")}
              </p>
              <p className="text-xs text-[#CBD5E1] mt-1">{t("upload.uploadHint")}</p>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
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
              {t("upload.takePhoto")}
            </button>
          ) : processing ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="flex-1 bg-red-500 text-white py-3 rounded-xl font-medium btn-press"
            >
              {t("upload.cancelRecognize")}
            </button>
          ) : allDone ? (
            <button
              onClick={() => router.push(`/project/${projectId}`)}
              className="flex-1 bg-brand text-white py-3 rounded-xl font-medium btn-press"
            >
              {t("upload.viewRecords")}
            </button>
          ) : (
            <button
              onClick={handleBatchRecognize}
              disabled={pendingCount === 0 || !projectId}
              className="flex-1 bg-brand text-white py-3 rounded-xl font-medium disabled:opacity-50 btn-press"
            >
              {t("upload.startRecognize")} ({pendingCount} {t("upload.countUnit")})
            </button>
          )}
        </div>

        {/* 供应商对账单入口：一张账单拆成多行，走独立的复核页 */}
        <button
          onClick={() => router.push(projectId ? `/bill?project=${projectId}` : "/bill")}
          className="w-full bg-white rounded-md p-4 shadow-card text-left flex items-center justify-between animate-fade-in-up stagger-3 btn-press"
        >
          <div>
            <p className="text-sm text-[#0F172A]">{t("bill.entry")}</p>
            <p className="text-xs text-[#64748B] mt-0.5">{t("bill.entryDesc")}</p>
          </div>
          <span className="text-brand text-lg shrink-0">→</span>
        </button>

        <div className="bg-brand-bg rounded-md p-4 animate-fade-in-up stagger-3">
          <p className="text-xs text-[#475569] leading-relaxed">
            {t("upload.tip")}
          </p>
        </div>
      </div>
      <TabBar projectId={urlProjectId || undefined} />
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
