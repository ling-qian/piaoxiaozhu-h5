"use client";

import { useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { recognizeImage } from "@/lib/ocr";
import { createRecordFromOcr } from "@/lib/actions/record-actions";
import { useToast } from "@/components/toast";
import PageHeader from "@/components/page-header";
import OcrProgress from "@/components/ocr-progress";

function UploadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") || "";
  const { showToast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("等待上传");
  const [recognizing, setRecognizing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(f);
    }
  }

  async function handleRecognize() {
    if (!file) return;

    if (!projectId) {
      showToast("请先选择项目", "error");
      return;
    }

    setRecognizing(true);
    setStatus("正在识别...");
    setProgress(0);

    try {
      const result = await recognizeImage(file, (p) => {
        setProgress(p);
        if (p < 100) setStatus(`正在识别... ${p}%`);
        else setStatus("识别完成，正在保存...");
      });

      const record = await createRecordFromOcr(projectId, result.rawText, file);

      showToast("识别成功", "success");
      router.push(`/result?project=${projectId}&recordId=${record.id}`);
    } catch (err: any) {
      showToast(err.message || "识别失败，请重试", "error");
      setStatus("识别失败");
    } finally {
      setRecognizing(false);
    }
  }

  function handleCamera() {
    inputRef.current?.click();
  }

  return (
    <div className="pb-20">
      <PageHeader title="票据上传" showBack onBack={() => router.back()} />

      <div className="px-4 -mt-4 space-y-4">
        <div className="bg-white rounded-md p-4 shadow-card animate-fade-in-up">
          {preview ? (
            <div className="relative w-full h-64 rounded-md bg-gray-50">
              <Image
                src={preview}
                alt="预览"
                fill
                className="object-contain rounded-md"
                unoptimized
              />
            </div>
          ) : (
            <div
              onClick={handleCamera}
              className="w-full h-64 border-2 border-dashed border-[#EEEEEE] rounded-md flex flex-col items-center justify-center cursor-pointer active:border-brand transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#CCCCCC" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mb-2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <p className="text-sm text-[#999999]">点击拍照或选择图片</p>
              <p className="text-xs text-[#CCCCCC] mt-1">支持 JPG、PNG 格式</p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
          />

          {preview && (
            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                setProgress(0);
                setStatus("等待上传");
              }}
              className="text-sm text-brand mt-2 btn-press"
            >
              重新选择
            </button>
          )}
        </div>

        {(recognizing || progress > 0) && (
          <OcrProgress progress={progress} status={status} />
        )}

        <div className="flex gap-3 animate-fade-in-up stagger-2">
          {!preview ? (
            <button
              onClick={handleCamera}
              className="flex-1 bg-brand text-white py-3 rounded-xl font-medium btn-press"
            >
              拍照/选图
            </button>
          ) : (
            <button
              onClick={handleRecognize}
              disabled={recognizing}
              className="flex-1 bg-brand text-white py-3 rounded-xl font-medium disabled:opacity-50 btn-press"
            >
              {recognizing ? "识别中..." : "开始识别"}
            </button>
          )}
        </div>

        <div className="bg-brand-bg rounded-md p-4 animate-fade-in-up stagger-3">
          <p className="text-xs text-[#666666] leading-relaxed">
            💡 提示：请确保票据清晰可见，避免反光和遮挡。支持增值税发票、收据、小票等常见票据类型。
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
