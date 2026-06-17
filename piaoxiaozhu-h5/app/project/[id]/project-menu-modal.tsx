"use client";

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
  async function handleDelete() {
    try {
      await onDeleteProject();
      showToast("项目已删除", "success");
      onClose();
    } catch {
      showToast("删除失败", "error");
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
        <h3 className="text-base font-semibold mb-4">项目操作</h3>

        {!confirmDelete ? (
          <div className="space-y-2">
            <button
              onClick={onViewReport}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#F5F5F5] text-sm"
            >
              📊 查看报表
            </button>
            <button
              onClick={() => onConfirmDelete()}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#FFF2F0] text-sm text-[#FF4D4F]"
            >
              🗑️ 删除项目
            </button>
            <button
              onClick={onClose}
              className="w-full text-center px-4 py-3 rounded-xl border border-[#EEEEEE] text-sm"
            >
              取消
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[#666666]">
              确定删除项目 <strong>{projectName}</strong>？所有记录将被永久删除，此操作不可撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancelDelete}
                className="flex-1 border border-[#EEEEEE] py-2.5 rounded-xl text-sm btn-press"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-[#FF4D4F] text-white py-2.5 rounded-xl text-sm btn-press"
              >
                确认删除
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
