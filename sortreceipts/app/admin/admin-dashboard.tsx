"use client";

import { CURRENCY_SYMBOL } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import PageHeader from "@/components/page-header";

type Tab = "overview" | "users" | "orders" | "points" | "partners" | "channels";

interface Overview {
  users: { total: number; today: number };
  orders: { total: number; paid: number };
  revenue_cents: number;
  records: number;
  projects: number;
  points: { issued: number; used: number };
}

interface UserItem {
  id: string;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  plan_code: string;
  plan_expires_at: string | null;
  points_balance: number;
  created_at: string;
}

interface OrderItem {
  id: string;
  plan_code: string;
  amount_cents: number;
  period_months: number;
  status: string;
  user_nickname: string | null;
  user_phone: string | null;
  created_at: string;
  paid_at: string | null;
}

interface PointItem {
  id: string;
  user_nickname: string | null;
  user_phone: string | null;
  user_id: string;
  action: string;
  delta: number;
  reason: string | null;
  created_at: string;
}

interface PartnerItem {
  code: string;
  name: string;
  contact: string | null;
  note: string | null;
  status: string;
  created_at: string;
  signups: number;
  paid_users: number;
  paid_orders: number;
  revenue_cents: number;
}

interface ChannelItem {
  source: string;
  medium: string | null;
  signups: number;
  paid_users: number;
  paid_orders: number;
  revenue_cents: number;
}

interface Diagnostics {
  ok?: boolean;
  verdict?: string;
  reason?: string;
  hint?: string;
  errcode?: number | null;
  errmsg?: string | null;
}

/** 金额分转元。后台展示一律带两位小数，和账单口径一致 */
function yuan(cents: number): string {
  return `${CURRENCY_SYMBOL}${(cents / 100).toFixed(2)}`;
}

function shortTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminDashboard() {
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [points, setPoints] = useState<PointItem[]>([]);
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [keyword, setKeyword] = useState("");

  const [partnerName, setPartnerName] = useState("");
  const [partnerContact, setPartnerContact] = useState("");
  const [partnerBusy, setPartnerBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const load = useCallback(async (which: Tab, kw = "") => {
    setLoading(true);
    setError(null);
    try {
      const urls: Record<Tab, string> = {
        overview: "/api/admin/overview",
        users: `/api/admin/users?size=50${kw ? `&keyword=${encodeURIComponent(kw)}` : ""}`,
        orders: "/api/admin/orders?size=50",
        points: "/api/admin/points?size=50",
        partners: "/api/admin/partners",
        channels: "/api/admin/channels",
      };

      const res = await fetch(urls[which]);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // 401 说明 cookie 里的令牌已失效（或 Worker 改了 ADMIN_TOKEN）
        if (res.status === 401) {
          router.refresh();
          return;
        }
        setError(data.error || t("admin.loadFailed"));
        return;
      }

      if (which === "overview") setOverview(data);
      else if (which === "users") setUsers(data.items ?? []);
      else if (which === "orders") setOrders(data.items ?? []);
      else if (which === "partners") setPartners(data.items ?? []);
      else if (which === "channels") setChannels(data.items ?? []);
      else setPoints(data.items ?? []);
    } catch {
      setError(t("admin.networkError"));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load(tab, tab === "users" ? keyword : "");
    // 只在切换标签时拉数据；搜索单独触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function runDiagnostics() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/diagnostics");
      const data = await res.json().catch(() => ({}));
      setDiag(res.ok ? data : { ok: false, reason: data.error || t("admin.diagnosticFailed") });
    } catch {
      setDiag({ ok: false, reason: t("admin.networkErrorShort") });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  async function handleCreatePartner(e: React.FormEvent) {
    e.preventDefault();
    const name = partnerName.trim();
    if (!name) return;
    setPartnerBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contact: partnerContact.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t("admin.partnerCreateFailed"));
        return;
      }
      setPartnerName("");
      setPartnerContact("");
      await load("partners");
    } catch {
      setError(t("admin.networkError"));
    } finally {
      setPartnerBusy(false);
    }
  }

  async function copyPartnerLink(code: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${code}`);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
    } catch {
      // 浏览器拒绝写剪贴板时，页面上的链接仍可手动选中
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: t("admin.tabOverview") },
    { key: "users", label: t("admin.tabUsers") },
    { key: "orders", label: t("admin.tabOrders") },
    { key: "points", label: t("admin.tabPoints") },
    { key: "partners", label: t("admin.tabPartners") },
    { key: "channels", label: t("admin.tabChannels") },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16">
      <PageHeader title={t("admin.title")} showBack />

      <div className="px-4 pt-1 space-y-3">
        {/* 标签栏 */}
        <div className="grid grid-cols-3 gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`py-2 rounded-lg text-sm font-medium ${
                tab === t.key ? "bg-[#2563EB] text-white" : "bg-white text-[#475569]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-xs text-[#DC2626] bg-white rounded-lg px-3 py-2">{error}</p>
        )}

        {/* 概览 */}
        {tab === "overview" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: t("admin.totalUsers"), value: overview?.users.total ?? 0, sub: `${t("admin.newToday")} ${overview?.users.today ?? 0}` },
                { label: t("admin.tabOrders"), value: overview?.orders.total ?? 0, sub: `${t("admin.paidCount")} ${overview?.orders.paid ?? 0}` },
                { label: t("admin.revenue"), value: yuan(overview?.revenue_cents ?? 0), sub: t("admin.revenueSub") },
                { label: t("admin.records"), value: overview?.records ?? 0, sub: `${t("admin.projectCount")} ${overview?.projects ?? 0}` },
              ].map((c) => (
                <div key={c.label} className="bg-white rounded-xl p-4 shadow-card">
                  <p className="text-xs text-[#64748B]">{c.label}</p>
                  <p className="text-xl font-bold text-[#0F172A] mt-1">{c.value}</p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">{c.sub}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl p-4 shadow-card">
              <p className="text-sm font-medium text-[#0F172A] mb-2">{t("admin.tabPoints")}</p>
              <div className="flex justify-between py-1">
                <span className="text-sm text-[#475569]">{t("admin.pointsIssued")}</span>
                <span className="text-sm font-semibold text-[#059669]">
                  +{overview?.points.issued ?? 0}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-sm text-[#475569]">{t("admin.pointsUsed")}</span>
                <span className="text-sm font-semibold text-[#0F172A]">
                  -{overview?.points.used ?? 0}
                </span>
              </div>
            </div>

            {/* 诊断 */}
            <div className="bg-white rounded-xl p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#0F172A]">{t("admin.wechatCheck")}</p>
                <button
                  onClick={runDiagnostics}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[#EFF6FF] text-[#2563EB]"
                >
                  {t("admin.run")}
                </button>
              </div>

              {diag && (
                <div className="mt-2 text-xs space-y-1">
                  <p className={diag.ok ? "text-[#059669]" : "text-[#DC2626]"}>
                    {diag.ok ? "✅ " : "❌ "}
                    {diag.verdict || diag.reason || t("admin.notPassed")}
                  </p>
                  {diag.errcode != null && (
                    <p className="text-[#64748B]">
                      errcode {diag.errcode}
                      {diag.errmsg ? ` · ${diag.errmsg}` : ""}
                    </p>
                  )}
                  {diag.hint && <p className="text-[#64748B]">{diag.hint}</p>}
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="w-full py-2.5 rounded-lg bg-white text-sm text-[#64748B] shadow-card"
            >
              {t("admin.logout")}
            </button>
          </div>
        )}

        {/* 用户 */}
        {tab === "users" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t("admin.searchPlaceholder")}
                className="flex-1 rounded-lg bg-white px-3 py-2 text-sm outline-none shadow-card"
              />
              <button
                onClick={() => load("users", keyword)}
                className="px-4 rounded-lg bg-[#2563EB] text-white text-sm"
              >
                {t("admin.search")}
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-card divide-y divide-[#F8FAFC]">
              {users.length === 0 ? (
                <p className="text-center text-sm text-[#64748B] py-10">{t("admin.noUsers")}</p>
              ) : (
                users.map((u) => (
                  <div key={u.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#0F172A]">
                        {u.nickname || t("admin.unnamed")}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-[#F8FAFC] text-[#475569]">
                        {u.plan_code}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-[#64748B]">
                        {u.phone || u.email || t("admin.noContact")}
                      </span>
                      <span className="text-[11px] text-[#2563EB]">
                        {u.points_balance} {t("admin.pointsUnit")}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">
                      {t("admin.registeredAt")} <span suppressHydrationWarning>{shortTime(u.created_at)}</span>
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 订单 */}
        {tab === "orders" && (
          <div className="bg-white rounded-xl shadow-card divide-y divide-[#F8FAFC]">
            {orders.length === 0 ? (
              <p className="text-center text-sm text-[#64748B] py-10">{t("admin.noOrders")}</p>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#0F172A]">{o.plan_code}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        o.status === "paid"
                          ? "bg-[#F6FFED] text-[#059669]"
                          : "bg-[#F8FAFC] text-[#64748B]"
                      }`}
                    >
                      {o.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-[#64748B]">
                      {o.user_nickname || t("admin.unknownUser")} · {o.user_phone || "—"}
                    </span>
                    <span className="text-sm font-semibold text-[#0F172A]">
                      {yuan(o.amount_cents)}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#94A3B8] mt-0.5">
                    {t("admin.orderedAt")} <span suppressHydrationWarning>{shortTime(o.created_at)}</span>
                    {o.paid_at ? <span suppressHydrationWarning>{` · ${t("admin.paidAt")} ${shortTime(o.paid_at)}`}</span> : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* 积分流水 */}
        {tab === "points" && (
          <div className="bg-white rounded-xl shadow-card divide-y divide-[#F8FAFC]">
            {points.length === 0 ? (
              <p className="text-center text-sm text-[#64748B] py-10">{t("admin.noPoints")}</p>
            ) : (
              points.map((p) => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-[#0F172A] truncate">
                      {p.user_nickname || t("admin.unknownUser")}
                      <span className="text-[11px] text-[#64748B] ml-1.5">{p.action}</span>
                    </p>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5 truncate">
                      {p.reason || p.user_phone || "—"} · <span suppressHydrationWarning>{shortTime(p.created_at)}</span>
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ml-3 shrink-0 ${
                      p.delta > 0 ? "text-[#059669]" : "text-[#0F172A]"
                    }`}
                  >
                    {p.delta > 0 ? "+" : ""}
                    {p.delta}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* 合作会计 */}
        {tab === "partners" && (
          <div className="space-y-3">
            <form
              onSubmit={handleCreatePartner}
              className="bg-white rounded-xl p-4 shadow-card space-y-2"
            >
              <p className="text-sm font-medium text-[#0F172A]">{t("admin.createPartner")}</p>
              <input
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder={t("admin.partnerNamePlaceholder")}
                maxLength={60}
                className="w-full rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm outline-none"
              />
              <input
                value={partnerContact}
                onChange={(e) => setPartnerContact(e.target.value)}
                placeholder={t("admin.partnerContactPlaceholder")}
                maxLength={120}
                className="w-full rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={partnerBusy || !partnerName.trim()}
                className="w-full py-2 rounded-lg bg-[#2563EB] text-white text-sm font-medium disabled:opacity-50"
              >
                {partnerBusy ? t("admin.partnerCreating") : t("admin.createPartner")}
              </button>
              <p className="text-[11px] text-[#64748B] leading-relaxed">{t("admin.partnerHint")}</p>
            </form>

            <div className="bg-white rounded-xl shadow-card divide-y divide-[#F8FAFC]">
              {partners.length === 0 ? (
                <p className="text-center text-sm text-[#64748B] py-10">{t("admin.noPartners")}</p>
              ) : (
                partners.map((p) => (
                  <div key={p.code} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#0F172A]">{p.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-[#F8FAFC] text-[#475569]">
                        {p.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-0.5">
                      {p.contact || "—"} · <span suppressHydrationWarning>{shortTime(p.created_at)}</span>
                    </p>

                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs px-2 py-1 rounded bg-[#EFF6FF] text-[#2563EB] font-mono">
                        {p.code}
                      </span>
                      <span className="text-[11px] text-[#64748B] truncate">/r/{p.code}</span>
                      <button
                        onClick={() => copyPartnerLink(p.code)}
                        className="ml-auto shrink-0 text-[11px] px-2 py-1 rounded bg-[#F8FAFC] text-[#475569]"
                      >
                        {copiedCode === p.code ? t("pack.copied") : t("admin.partnerLink")}
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2 mt-2 text-center">
                      {[
                        { label: t("admin.partnerSignups"), value: p.signups },
                        { label: t("admin.partnerPaidUsers"), value: p.paid_users },
                        { label: t("admin.partnerPaidOrders"), value: p.paid_orders },
                        { label: t("admin.partnerRevenue"), value: yuan(p.revenue_cents) },
                      ].map((s) => (
                        <div key={s.label} className="rounded-lg bg-[#F8FAFC] py-2">
                          <p className="text-sm font-semibold text-[#0F172A]">{s.value}</p>
                          <p className="text-[10px] text-[#64748B] mt-0.5 leading-tight">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 渠道 */}
        {tab === "channels" && (
          <div className="space-y-3">
            <p className="text-[11px] text-[#64748B] bg-white rounded-lg px-3 py-2 leading-relaxed">
              {t("admin.channelHint")}
            </p>

            <div className="bg-white rounded-xl shadow-card divide-y divide-[#F8FAFC]">
              {channels.length === 0 ? (
                <p className="text-center text-sm text-[#64748B] py-10">{t("admin.noChannels")}</p>
              ) : (
                channels.map((c) => (
                  <div key={`${c.source}-${c.medium ?? ""}`} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#0F172A]">{c.source}</span>
                      {c.medium && (
                        <span className="text-xs px-2 py-0.5 rounded bg-[#F8FAFC] text-[#475569]">
                          {c.medium}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2 mt-2 text-center">
                      {[
                        { label: t("admin.channelSignups"), value: c.signups },
                        { label: t("admin.channelPaidUsers"), value: c.paid_users },
                        { label: t("admin.channelPaidOrders"), value: c.paid_orders },
                        { label: t("admin.channelRevenue"), value: yuan(c.revenue_cents) },
                      ].map((s) => (
                        <div key={s.label} className="rounded-lg bg-[#F8FAFC] py-2">
                          <p className="text-sm font-semibold text-[#0F172A]">{s.value}</p>
                          <p className="text-[10px] text-[#64748B] mt-0.5 leading-tight">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {loading && <p className="text-xs text-[#64748B] text-center">{t("admin.loading")}</p>}
      </div>
    </div>
  );
}
