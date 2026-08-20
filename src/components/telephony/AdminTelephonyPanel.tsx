"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus, Settings, AlertCircle, CheckCircle2, Clock, Phone
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/telephony-api";
import { AdminPageToolbar } from "@/components/admin/AdminPageToolbar";
import {
  btnPrimary, adminRegistryPage, adminRegistryContent,
  btnFilterGroup, btnFilterActive, btnFilterIdle
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { PhoneLinesTable, type PhoneLineRow } from "@/components/telephony/PhoneLinesTable";
import {
  PhoneNumberCategoryTabs,
  type PhoneNumberCategoryTab
} from "@/components/telephony/PhoneNumberCategoryTabs";
import { isPurchasedNumber, isVerifiedNumber } from "@/lib/telephony/number-type-labels";
import { PhoneLineRequestsTable } from "@/components/telephony/PhoneLineRequestsTable";
import { AdminBuyLineModal } from "@/components/telephony/AdminBuyLineModal";
import { AdminTransferLineModal } from "@/components/telephony/AdminTransferLineModal";
import type { PhoneNumberRecord } from "@/types/phone-number";
import type { PhoneLineRequestAdminRow, PhoneLineRequestStatus } from "@/types/phone-line-request";

interface AdminTelephonyPanelProps {
  preselectedUserId?: string | null;
  initialTab?: "lines" | "requests";
}

interface TelnyxConfig {
  configured: boolean;
  provider: string;
  telnyx: { configured: boolean; has_connection: boolean; missing: string[] };
  required: Record<string, string>;
}

type Tab = "lines" | "requests";

export function AdminTelephonyPanel({ preselectedUserId, initialTab }: AdminTelephonyPanelProps) {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    tabFromUrl === "solicitudes" || initialTab === "requests" ? "requests" : "lines"
  );

  const [config, setConfig] = useState<TelnyxConfig | null>(null);
  const [numbers, setNumbers] = useState<PhoneNumberRecord[]>([]);
  const [requests, setRequests] = useState<PhoneLineRequestAdminRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [users, setUsers] = useState<{ id: string; email: string; nombre: string }[]>([]);
  const [agentNameMap, setAgentNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lineCategory, setLineCategory] = useState<PhoneNumberCategoryTab>("purchased");
  const [showBuy, setShowBuy] = useState(false);
  const [buyUserId, setBuyUserId] = useState<string | null>(preselectedUserId ?? null);
  const [attendRequestId, setAttendRequestId] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [transferLine, setTransferLine] = useState<PhoneLineRow | null>(null);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [cfgRes, numRes, reqRes, usersRes] = await Promise.all([
      authFetch("/api/admin/telephony/config"),
      authFetch("/api/admin/telephony/numbers"),
      authFetch("/api/admin/telephony/requests"),
      supabase.from("users").select("id, email, nombre")
    ]);
    const cfg = await cfgRes.json();
    const num = await numRes.json();
    const req = await reqRes.json();
    if (cfgRes.ok) setConfig(cfg);
    if (numRes.ok) {
      const rows: PhoneNumberRecord[] = num.phone_numbers ?? [];
      setNumbers(rows);
      const agentIds = [...new Set(rows.map(r => r.voice_agent_id).filter(Boolean))] as string[];
      if (agentIds.length) {
        const { data } = await supabase.from("voice_agents").select("id, name").in("id", agentIds);
        const map: Record<string, string> = {};
        (data ?? []).forEach(a => { map[a.id] = a.name; });
        setAgentNameMap(map);
      }
    } else setError(num.error ?? "Error al cargar");
    if (reqRes.ok) {
      setRequests(req.requests ?? []);
      setPendingCount(req.pending_count ?? 0);
    }
    setUsers(usersRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tabFromUrl === "solicitudes") setTab("requests");
  }, [tabFromUrl]);

  async function handleRelease(id: string, e164: string) {
    if (!confirm(`¿Liberar ${e164}?`)) return;
    setReleasingId(id);
    const res = await authFetch("/api/admin/telephony/numbers", {
      method: "DELETE",
      body: JSON.stringify({ id })
    });
    setReleasingId(null);
    if (res.ok) await load();
    else {
      const data = await res.json();
      setError(data.error ?? "Error al liberar");
    }
  }

  async function handleUpdateRequestStatus(id: string, status: PhoneLineRequestStatus) {
    setUpdatingRequestId(id);
    const res = await authFetch("/api/admin/telephony/requests", {
      method: "PATCH",
      body: JSON.stringify({ id, status })
    });
    setUpdatingRequestId(null);
    if (res.ok) await load();
    else {
      const data = await res.json();
      setError(data.error ?? "Error al actualizar solicitud");
    }
  }

  async function handleAttendRequest(row: PhoneLineRequestAdminRow) {
    setUpdatingRequestId(row.id);
    await authFetch("/api/admin/telephony/requests", {
      method: "PATCH",
      body: JSON.stringify({ id: row.id, status: "in_progress" })
    });
    setUpdatingRequestId(null);
    setBuyUserId(row.user_id);
    setAttendRequestId(row.id);
    setShowBuy(true);
    await load();
  }

  async function handleBuySuccess() {
    if (attendRequestId) {
      await authFetch("/api/admin/telephony/requests", {
        method: "PATCH",
        body: JSON.stringify({ id: attendRequestId, status: "completed" })
      });
      setAttendRequestId(null);
    }
    await load();
  }

  const verifiedLines = useMemo(
    () => numbers.filter(n => isVerifiedNumber(n.number_type)),
    [numbers]
  );
  const purchasedLines = useMemo(
    () => numbers.filter(n => isPurchasedNumber(n.number_type)),
    [numbers]
  );

  const categoryLines = lineCategory === "verified" ? verifiedLines : purchasedLines;

  const filtered = categoryLines.filter(n => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const u = users.find(x => x.id === n.user_id);
    return (
      n.e164.includes(q) ||
      (n.friendly_name ?? "").toLowerCase().includes(q) ||
      u?.email?.toLowerCase().includes(q) ||
      u?.nombre?.toLowerCase().includes(q)
    );
  });

  const filteredRequests = requests.filter(r =>
    (r.client_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.client_email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.notes ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const tableRows: PhoneLineRow[] = filtered.map(n => {
    const u = users.find(x => x.id === n.user_id);
    return {
      id: n.id,
      e164: n.e164,
      friendly_name: n.friendly_name,
      country_code: n.country_code,
      number_type: n.number_type,
      status: n.status,
      provider: n.provider,
      clientName: u?.nombre || u?.email,
      agentName: n.voice_agent_id ? agentNameMap[n.voice_agent_id] : null
    };
  });

  const linesPagination = useRegistryPagination(tableRows.length, `${tab}-${search}-${lineCategory}`);
  const requestsPagination = useRegistryPagination(filteredRequests.length, `${tab}-${search}`);
  const pagedTableRows = linesPagination.pageRows(tableRows);
  const pagedRequests = requestsPagination.pageRows(filteredRequests);

  return (
    <>
      <div className={adminRegistryPage}>
        <AdminPageToolbar
          icon={Phone}
          backHref="/admin"
          title="Líneas telefónicas"
          subtitle="Superadmin · Telnyx · solicitudes de clientes"
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={tab === "lines" ? "Buscar" : "Buscar solicitud..."}
          onRefresh={load}
          refreshing={loading}
          action={
            <button
              onClick={() => {
                setBuyUserId(preselectedUserId ?? null);
                setAttendRequestId(null);
                setShowBuy(true);
              }}
              disabled={!config?.configured}
              className={`${btnPrimary} flex items-center gap-2 shrink-0 disabled:opacity-40`}
            >
              <Plus className="w-4 h-4" /> Comprar línea
            </button>
          }
        />

        <div className={adminRegistryContent}>
          <RegistryTableLayout
            error={error || undefined}
            alerts={<>
          {pendingCount > 0 && (
            <div className="mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[.06] text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0" />
                {pendingCount} solicitud{pendingCount > 1 ? "es" : ""} pendiente{pendingCount > 1 ? "s" : ""} de clientes
              </div>
              <button
                onClick={() => setTab("requests")}
                className="text-[#0f7eff] hover:text-[#3392ff] font-medium shrink-0"
              >
                Ver solicitudes →
              </button>
            </div>
          )}

          {config && (
            <div className={`mb-4 p-4 rounded-xl border text-xs ${
              config.configured
                ? "border-emerald-500/25 bg-emerald-500/[.06]"
                : "border-amber-500/25 bg-amber-500/[.06]"
            }`}>
              <div className="flex items-start gap-2">
                {config.configured ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-2">
                  <p className={config.configured ? "text-emerald-300" : "text-amber-200"}>
                    {config.configured
                      ? "Telnyx conectado — puedes comprar líneas."
                      : "Pega tu API Key de Telnyx en .env.local para activar compras reales."}
                  </p>
                  {config.configured && !config.telnyx.has_connection && (
                    <p className="text-gray-400">
                      <Settings className="w-3 h-3 inline mr-1" />
                      Opcional: agrega TELNYX_CONNECTION_ID para inbound con Call Control.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
            </>}
            filters={
              <div className="space-y-4">
                <div className={`${btnFilterGroup} w-fit`}>
                  <button
                    onClick={() => setTab("lines")}
                    className={tab === "lines" ? btnFilterActive : btnFilterIdle}
                  >
                    Líneas activas
                  </button>
                  <button
                    onClick={() => setTab("requests")}
                    className={`${tab === "requests" ? btnFilterActive : btnFilterIdle} relative`}
                  >
                    Solicitudes
                    {pendingCount > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-[10px] font-bold text-black">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                </div>
                {tab === "lines" && (
                  <PhoneNumberCategoryTabs
                    value={lineCategory}
                    onChange={setLineCategory}
                    verifiedCount={verifiedLines.length}
                    purchasedCount={purchasedLines.length}
                  />
                )}
              </div>
            }
            footer={
              tab === "lines" && tableRows.length > 0 ? (
                <RegistryTablePagination
                  total={linesPagination.total}
                  rangeStart={linesPagination.rangeStart}
                  rangeEnd={linesPagination.rangeEnd}
                  pageSafe={linesPagination.pageSafe}
                  totalPages={linesPagination.totalPages}
                  pageSize={linesPagination.pageSize}
                  onPageChange={linesPagination.setPage}
                  onPageSizeChange={linesPagination.setPageSize}
                  label="líneas"
                />
              ) : tab === "requests" && filteredRequests.length > 0 ? (
                <RegistryTablePagination
                  total={requestsPagination.total}
                  rangeStart={requestsPagination.rangeStart}
                  rangeEnd={requestsPagination.rangeEnd}
                  pageSafe={requestsPagination.pageSafe}
                  totalPages={requestsPagination.totalPages}
                  pageSize={requestsPagination.pageSize}
                  onPageChange={requestsPagination.setPage}
                  onPageSizeChange={requestsPagination.setPageSize}
                  label="solicitudes"
                />
              ) : undefined
            }
          >
          {tab === "lines" ? (
            <PhoneLinesTable
              rows={pagedTableRows}
              mode="admin"
              loading={loading}
              emptyMessage={
                lineCategory === "verified"
                  ? "No hay números verificados (solo outbound)."
                  : "Aún no hay líneas compradas. Usa «Comprar línea» para aprovisionar vía Telnyx."
              }
              onRelease={handleRelease}
              onTransfer={row => setTransferLine(row)}
              releasingId={releasingId}
            />
          ) : (
            <PhoneLineRequestsTable
              rows={pagedRequests}
              loading={loading}
              updatingId={updatingRequestId}
              onAttend={handleAttendRequest}
              onUpdateStatus={handleUpdateRequestStatus}
            />
          )}
          </RegistryTableLayout>
        </div>
      </div>

      <AdminTransferLineModal
        open={Boolean(transferLine)}
        line={
          transferLine
            ? {
                id: transferLine.id,
                e164: transferLine.e164,
                clientName: transferLine.clientName,
              }
            : null
        }
        onClose={() => setTransferLine(null)}
        onSuccess={() => void load()}
      />
      <AdminBuyLineModal
        open={showBuy}
        onClose={() => {
          setShowBuy(false);
          setAttendRequestId(null);
        }}
        onSuccess={handleBuySuccess}
        preselectedUserId={buyUserId}
      />
    </>
  );
}
