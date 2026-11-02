"use client";

import { useRef, useState } from "react";

import PageHeader from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import { ask, type AskResult } from "@/lib/actions/insights-actions";

interface Turn {
  id: number;
  question: string;
  result?: AskResult;
  error?: string;
}

/** 没问过话时给几个例子，比空白输入框更能让人知道该问什么 */
const EXAMPLE_KEYS = ["ask.ex1", "ask.ex2", "ask.ex3"];

export default function AskClient() {
  const { t } = useI18n();

  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const seq = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;

    const id = ++seq.current;
    setTurns((prev) => [...prev, { id, question: q }]);
    setInput("");
    setLoading(true);

    try {
      const result = await ask(q);
      setTurns((prev) => prev.map((x) => (x.id === id ? { ...x, result } : x)));
      setFreeLeft(result.freeRemaining);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("ask.failed");
      setTurns((prev) => prev.map((x) => (x.id === id ? { ...x, error: msg } : x)));
    } finally {
      setLoading(false);
      // 等 DOM 更新后再滚，否则滚不到最新一条
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <PageHeader title={t("ask.title")} showBack />

      <div className="flex-1 overflow-y-auto px-4 pt-1 pb-32 space-y-3 lg:mx-auto lg:w-full lg:max-w-3xl lg:space-y-4 lg:px-8 lg:pt-6">
        {turns.length === 0 ? (
          <div className="pt-6">
            <p className="text-sm text-[#475569] mb-1">{t("ask.subtitle")}</p>
            <p className="text-[11px] text-[#64748B] mb-4">
              问账免费额度每天 5 次，超出后每次 1 积分
            </p>
            <div className="space-y-2">
              {EXAMPLE_KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => send(t(k))}
                  className="w-full text-left bg-white rounded-xl px-4 py-3 text-sm text-[#0F172A] shadow-card active:opacity-70"
                >
                  {t(k)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className="space-y-2">
              {/* 问 */}
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-[#2563EB] text-white rounded-2xl rounded-br-sm px-4 py-2.5">
                  <p className="text-sm whitespace-pre-wrap break-words">{turn.question}</p>
                </div>
              </div>

              {/* 答 */}
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-card">
                  {turn.result ? (
                    <>
                      {turn.result.interpretation && (
                        <p className="text-[11px] text-[#64748B] mb-1.5">
                          {t("ask.interpretation")}：{turn.result.interpretation}
                        </p>
                      )}
                      <p className="text-sm text-[#0F172A] whitespace-pre-wrap break-words">
                        {turn.result.answer}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {turn.result.timeRange && (
                          <span className="text-[10px] text-[#64748B] bg-[#F8FAFC] rounded px-1.5 py-0.5">
                            {turn.result.timeRange}
                          </span>
                        )}
                        {turn.result.charged ? (
                          <span className="text-[10px] text-[#2563EB]">
                            {t("ask.charged")}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#64748B]">
                            {t("ask.freeLeft").replace("{n}", String(turn.result.freeRemaining))}
                          </span>
                        )}
                      </div>
                    </>
                  ) : turn.error ? (
                    <p className="text-sm text-[#DC2626]">{turn.error}</p>
                  ) : (
                    <p className="text-sm text-[#64748B]">{t("ask.thinking")}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区固定在底部：桌面上让出左侧导航的位置，与内容同宽 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] px-4 py-3 lg:left-[260px] lg:px-10">
        <div className="lg:mx-auto lg:max-w-3xl">
        {freeLeft !== null && (
          <p className="text-[10px] text-[#64748B] mb-1.5">
            {t("ask.freeLeft").replace("{n}", String(freeLeft))}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter 发送，Shift+Enter 换行。手机上默认回车换行更自然，所以只在桌面生效
              if (e.key === "Enter" && !e.shiftKey && window.innerWidth >= 768) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={t("ask.placeholder")}
            className="flex-1 resize-none rounded-xl bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none max-h-24"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium text-white shrink-0 ${
              loading || !input.trim() ? "bg-[#D9D9D9]" : "bg-[#2563EB] active:opacity-80"
            }`}
          >
            {t("ask.send")}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
