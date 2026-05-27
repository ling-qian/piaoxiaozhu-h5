"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";

export function useExportCsv(projectId: string) {
  const [exporting, setExporting] = useState(false);
  const { showToast } = useToast();

  async function handleExport(month?: string) {
    setExporting(true);
    try {
      const params = new URLSearchParams({ projectId, format: "csv" });
      if (month) params.set("month", month);
      const res = await fetch(`/api/export?${params}`);
      if (!res.ok) throw new Error("导出失败");
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
    } catch {
      showToast("导出失败", "error");
    } finally {
      setExporting(false);
    }
  }

  return { exporting, handleExport };
}
