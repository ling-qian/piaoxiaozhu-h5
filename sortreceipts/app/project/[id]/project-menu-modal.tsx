"use client";

import { useI18n } from "@/lib/i18n";

interface ProjectMenuModalProps {
  projectName: string;
  projectId: string;
  confirmDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClose: () => void;
  onDeleteProject: () => void;
  onViewReport: () => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

/** 项目操作弹窗 — 查看报表 / 删除项目 */
export default function ProjectMenuModal({
  projectName,
  confirmDelete,
  onConfirmDelete,
  onCancelDelete,
  onClose,
  onDeleteProject,
  onViewReport,
  showToast,
}: ProjectMenuModalProps) {
  const { t } = useI18n();
  async function handleDelete() {
    try {
      await onDeleteProject();
      showToast(t("project.deleted"), "success");
      onClose();
    } catch {
      showToast(t("common.deleteFailed"), "error");
      onCancelDelete();
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center animate-fade-in"
      onClick={() => {
        onClose();
        onCancelDelete();
      }}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-mobile animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-4">{t("project.menuTitle")}</h3>

        {!confirmDelete ? (
          <div className="space-y-2">
            <button
              onClick={onViewReport}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#F8FAFC] text-sm"
            >
              📊 {t("project.viewReport")}
            </button>
            <button
              onClick={() => onConfirmDelete()}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#FFF2F0] text-sm text-[#DC2626]"
            >
              🗑️ {t("project.deleteProject")}
            </button>
            <button
              onClick={onClose}
              className="w-full text-center px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm"
            >
              {t("common.cancel")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[#475569]">
              {t("project.deleteConfirmPrefix")} <strong>{projectName}</strong>{t("project.deleteConfirmSuffix")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancelDelete}
                className="flex-1 border border-[#E2E8F0] py-2.5 rounded-xl text-sm btn-press"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-[#DC2626] text-white py-2.5 rounded-xl text-sm btn-press"
              >
                {t("project.confirmDelete")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
