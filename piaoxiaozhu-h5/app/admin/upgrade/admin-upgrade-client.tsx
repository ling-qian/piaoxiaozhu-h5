"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";

interface UserInfo {
  id: string;
  name: string | null;
  email: string;
}

interface UpgradeRequest {
  id: string;
  userId: string;
  planCode: string;
  payMethod: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: UserInfo;
}

const PLAN_NAMES: Record<string, string> = {
  pro: "专业版",
  enterprise: "企业版",
};

const PAY_METHOD_NAMES: Record<string, string> = {
  wechat: "微信支付",
  alipay: "支付宝",
};

export default function AdminUpgradeClient({
  pendingRequests: initialPending,
  reviewedRequests: initialReviewed,
}: {
  pendingRequests: UpgradeRequest[];
  reviewedRequests: UpgradeRequest[];
}) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(initialPending);
  const [reviewed, setReviewed] = useState(initialReviewed);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);

  async function handleAction(requestId: string, action: "approve" | "reject") {
    setProcessing(requestId);
    try {
      const res = await fetch("/api/admin/upgrade-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action,
          reviewNote: action === "reject" ? rejectNote[requestId] || "" : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(action === "approve" ? "已通过并升级" : "已拒绝", "success");
        // 移动到已审核列表
        const req = pending.find((r) => r.id === requestId);
        if (req) {
          setPending((prev) => prev.filter((r) => r.id !== requestId));
          setReviewed((prev) => [
            {
              ...req,
              status: action === "approve" ? "approved" : "rejected",
              reviewNote: action === "reject" ? rejectNote[requestId] || null : null,
              reviewedAt: new Date().toISOString(),
            },
            ...prev,
          ]);
        }
        setShowRejectInput(null);
      } else {
        showToast(data.error || "操作失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    } finally {
      setProcessing(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] pb-10">
      <div className="bg-white border-b border-[#EEEEEE] px-4 py-3 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-[#333333]">升级审核管理</h1>
        <p className="text-xs text-[#999999] mt-0.5">
          待审核 {pending.length} 项
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 mt-4 space-y-4">
        {/* 待审核 */}
        {pending.length === 0 ? (
          <div className="bg-white rounded-md p-8 text-center">
            <p className="text-[#999999]">暂无待审核请求</p>
          </div>
        ) : (
          pending.map((req) => (
            <div key={req.id} className="bg-white rounded-md p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-[#333333]">
                    {req.user.name || req.user.email}
                  </p>
                  <p className="text-xs text-[#999999]">{req.user.email}</p>
                </div>
                <span className="text-xs bg-[#FFF7E6] text-[#D46B08] px-2 py-0.5 rounded-full">
                  待审核
                </span>
              </div>

              <div className="mt-3 flex items-center gap-4 text-sm text-[#666666]">
                <span>
                  升级到 <strong className="text-[#FF6B35]">{PLAN_NAMES[req.planCode] || req.planCode}</strong>
                </span>
                <span>支付方式：{PAY_METHOD_NAMES[req.payMethod] || req.payMethod}</span>
              </div>

              <p className="text-xs text-[#BBBBBB] mt-1">
                提交时间：{new Date(req.createdAt).toLocaleString("zh-CN")}
              </p>

              {showRejectInput === req.id && (
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="拒绝原因（可选）"
                    value={rejectNote[req.id] || ""}
                    onChange={(e) =>
                      setRejectNote((prev) => ({ ...prev, [req.id]: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-[#EEEEEE] rounded-md text-sm"
                  />
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleAction(req.id, "approve")}
                  disabled={processing === req.id}
                  className="flex-1 py-2 rounded-md text-sm font-medium text-white bg-[#07C160] btn-press disabled:opacity-50"
                >
                  {processing === req.id ? "处理中..." : "通过（确认收款）"}
                </button>
                {showRejectInput === req.id ? (
                  <button
                    onClick={() => handleAction(req.id, "reject")}
                    disabled={processing === req.id}
                    className="flex-1 py-2 rounded-md text-sm font-medium text-white bg-[#F5222D] btn-press disabled:opacity-50"
                  >
                    确认拒绝
                  </button>
                ) : (
                  <button
                    onClick={() => setShowRejectInput(req.id)}
                    className="flex-1 py-2 rounded-md text-sm font-medium text-[#F5222D] border border-[#FFA39E] btn-press"
                  >
                    拒绝
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {/* 已审核记录 */}
        {reviewed.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-medium text-[#999999] mb-2">最近审核记录</h2>
            {reviewed.map((req) => (
              <div key={req.id} className="bg-white rounded-md p-3 mb-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#333333]">
                    {req.user.name || req.user.email}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      req.status === "approved"
                        ? "bg-[#F6FFED] text-[#52C41A]"
                        : "bg-[#FFF1F0] text-[#F5222D]"
                    }`}
                  >
                    {req.status === "approved" ? "已通过" : "已拒绝"}
                  </span>
                </div>
                <p className="text-xs text-[#999999] mt-1">
                  {PLAN_NAMES[req.planCode]} · {PAY_METHOD_NAMES[req.payMethod]}
                  {req.reviewNote && ` · ${req.reviewNote}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
