"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";

export function useExportCsv(projectId: string) {
  const [exporting, setExporting] = useState(false);
  const { showToast } = useToast();

  async function handleExport(month?: string) {
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, format: "csv", month }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "导出失败");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${projectId}${month ? `-${month}` : ""}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("导出成功", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "导出失败", "error");
    } finally {
      setExporting(false);
    }
  }

  return { exporting, handleExport };
}
