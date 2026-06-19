"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft, Copy, Loader2, MessageCircle, Plus, Clock, FileText
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/telephony-api";
import {
  btnPrimary, btnGhost, adminRegistryPage, registryToolbar, adminRegistryContent,
  btnFilterGroup, btnFilterActive, btnFilterIdle, registryTable,
  registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableCell, registryTableRow, textMuted
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import {
  templateStatusColor,
  templateStatusLabel
} from "@/lib/whatsapp/template-record";
import type { WhatsAppTemplateStatus } from "@/types/whatsapp-template";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

type Tab = "lines" | "approvals" | "requests";

function resolveWhatsAppAdminTab(param: string | null): Tab {
  if (param === "aprobaciones" || param === "approvals") return "approvals";
  if (param === "requests" || param === "solicitudes") return "requests";
  return "lines";
}

interface WhatsAppRequestRow {
  id: string;
  user_id: string;
  text_agent_id: string | null;
  phone_e164: string | null;
  friendly_name: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  profiles: { email: string; full_name: string | null } | null;
  text_agents: { name: string } | null;
}

interface PendingRow {
  id: string;
  template_name: string;
  status: string;
  body_source: string | null;
  body_preview: string;
  updated_at: string;
  rejection_reason: string | null;
  channel_e164: string | null;
  user_email: string | null;
  user_nombre: string | null;
}

export function AdminWhatsAppPanel() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => resolveWhatsAppAdminTab(searchParams.get("tab")));

  const [channels, setChannels] = useState<WhatsAppChannelRecord[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; nombre: string }[]>([]);
  const [templates, setTemplates] = useState<PendingRow[]>([]);
  const [requests, setRequests] = useState<WhatsAppRequestRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | boolean>(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState<"pending_approval" | "all_pending">("pending_approval");

  const [userId, setUserId] = useState("");
  const [e164, setE164] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [messagingServiceSid, setMessagingServiceSid] = useState("");
  const [activate, setActivate] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [chRes, usersRes, tplRes, reqRes] = await Promise.all([
      authFetch("/api/admin/whatsapp/channels"),
      supabase.from("users").select("id, email, nombre").order("email"),
      authFetch(`/api/admin/whatsapp/templates?status=${approvalFilter}`),
      authFetch("/api/admin/whatsapp/requests")
    ]);
    const chData = await chRes.json();
    const tplData = await tplRes.json();
    const reqData = await reqRes.json();

    if (chRes.ok) {
      setChannels(chData.channels ?? []);
      setWebhookUrl(String(chData.webhook_url ?? ""));
    } else setError(chData.error || "Error al cargar");

    if (tplRes.ok) {
      setTemplates(tplData.templates ?? []);
      setPendingCount(tplData.pending_count ?? 0);
    }

    if (reqRes.ok) {
      setRequests(reqData.requests ?? []);
      setPendingRequestsCount((reqData.requests ?? []).filter((r: WhatsAppRequestRow) => r.status === "pending").length);
    } else if (!error) {
      setError(reqData.error || "Error al cargar solicitudes WhatsApp");
    }

    if (usersRes.data) setUsers(usersRes.data);
    setLoading(false);
  }, [approvalFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setTab(resolveWhatsAppAdminTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    if (tab === "lines") return;
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [tab, load]);

  const handleProvision = async (requestId: string) => {
    if (!confirm("¿Deseas crear una subcuenta en Twilio y el canal para esta solicitud?")) return;
    
    setSaving(requestId as any); // hack para mostrar cargando en el botón
    try {
      const res = await authFetch(`/api/admin/whatsapp/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "provision" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al aprovisionar");
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (requestId: string, status: string) => {
    try {
      const res = await authFetch(`/api/admin/whatsapp/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) await load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/whatsapp/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          e164,
          friendly_name: friendlyName || undefined,
          twilio_messaging_service_sid: messagingServiceSid || undefined,
          status: activate ? "active" : "pending"
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo registrar");
        return;
      }
      setE164("");
      setFriendlyName("");
      setMessagingServiceSid("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, status: string) => {
    const next = status === "active" ? "pending" : "active";
    const res = await authFetch("/api/admin/whatsapp/channels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next })
    });
    if (res.ok) load();
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const channelsPagination = useRegistryPagination(channels.length);
  const templatesPagination = useRegistryPagination(templates.length, approvalFilter);
  const pagedChannels = channelsPagination.pageRows(channels);
  const pagedTemplates = templatesPagination.pageRows(templates);

  return (
    <div className={adminRegistryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold">WhatsApp (Twilio)</h1>
              <p className={`${textMuted} text-xs mt-0.5`}>Líneas, webhooks y aprobaciones Meta</p>
            </div>
          </div>
          {tab === "lines" && (
            <button type="button" onClick={() => document.getElementById("wa-register-form")?.scrollIntoView({ behavior: "smooth" })} className={btnPrimary}>
              <Plus className="w-4 h-4" /> Registrar línea
            </button>
          )}
          {tab === "approvals" && (
            <button type="button" onClick={load} className={btnGhost}>
              Actualizar
            </button>
          )}
        </div>
        <div className={`${btnFilterGroup} mt-4`}>
          <button type="button" onClick={() => setTab("lines")} className={tab === "lines" ? btnFilterActive : btnFilterIdle}>
            Líneas
          </button>
          <button type="button" onClick={() => setTab("approvals")} className={tab === "approvals" ? btnFilterActive : btnFilterIdle}>
            Aprobaciones
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
                {pendingCount}
              </span>
            )}
          </button>
          <button type="button" onClick={() => setTab("requests")} className={tab === "requests" ? btnFilterActive : btnFilterIdle}>
            Solicitudes
            {pendingRequestsCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#5b5bf6] px-1 text-[10px] font-bold text-white">
                {pendingRequestsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className={adminRegistryContent}>
        {loading ? (
          <div className="flex justify-center py-20 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : tab === "lines" ? (
          <div className="space-y-8 max-w-4xl">
            {webhookUrl && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[.06] p-4 space-y-2">
                <p className="text-sm font-medium text-emerald-300">Webhook Twilio Console (Master)</p>
                <p className={`${textMuted} text-xs`}>
                  Messaging → WhatsApp Senders → HTTP POST al recibir mensaje
                </p>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs break-all bg-black/30 rounded-lg px-3 py-2">{webhookUrl}</code>
                  <button type="button" onClick={copyWebhook} className={btnGhost}>
                    <Copy className="w-4 h-4" /> {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            )}

            <RegistryTableLayout
              onRefresh={load}
              refreshing={loading}
              footer={channels.length > 0 ? (
                <RegistryTablePagination
                  total={channelsPagination.total}
                  rangeStart={channelsPagination.rangeStart}
                  rangeEnd={channelsPagination.rangeEnd}
                  pageSafe={channelsPagination.pageSafe}
                  totalPages={channelsPagination.totalPages}
                  pageSize={channelsPagination.pageSize}
                  onPageChange={channelsPagination.setPage}
                  onPageSizeChange={channelsPagination.setPageSize}
                  label="líneas"
                />
              ) : undefined}
            >
              {channels.length === 0 ? (
                <p className="text-sm text-gray-500 py-10 text-center">Sin líneas registradas.</p>
              ) : (
                <table className={`${registryTable} min-w-full`}>
                  <thead className={registryTableHead}>
                    <tr className={registryTableHeadRow}>
                      <th className={registryTableHeadCell}>Número</th>
                      <th className={registryTableHeadCell}>Cliente</th>
                      <th className={registryTableHeadCell}>Subcuenta</th>
                      <th className={registryTableHeadCell}>Estado</th>
                      <th className={registryTableHeadCell} />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedChannels.map(ch => {
                      const u = users.find(x => x.id === ch.user_id);
                      return (
                        <tr key={ch.id} className={registryTableRow}>
                          <td className={`${registryTableCell} font-mono text-sm`}>
                            <div className="flex items-center gap-2">
                              <MessageCircle className="w-4 h-4 text-emerald-400" />
                              {ch.e164}
                            </div>
                          </td>
                          <td className={`${registryTableCell} text-sm`}>{u?.email ?? ch.user_id.slice(0, 8)}</td>
                          <td className={`${registryTableCell} font-mono text-[10px] text-gray-500`}>
                            {ch.twilio_subaccount_sid || "Master"}
                          </td>
                          <td className={registryTableCell}>{ch.status}</td>
                          <td className={registryTableCell}>
                            <button type="button" onClick={() => toggleActive(ch.id, ch.status)} className={btnGhost}>
                              {ch.status === "active" ? "Desactivar" : "Activar"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </RegistryTableLayout>

            <form id="wa-register-form" onSubmit={handleCreate} className="rounded-xl border border-white/[.10] bg-white/[.02] p-5 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" /> Registrar línea WhatsApp (Manual)
              </h2>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Cliente</label>
                <NoovaSelect
                  value={userId}
                  onChange={setUserId}
                  allowEmpty={true}
                  emptyLabel="Seleccionar usuario"
                  options={users.map(u => ({
                    value: u.id,
                    label: `${u.nombre || u.email} (${u.email})`
                  }))}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Número E.164</label>
                  <input value={e164} onChange={e => setE164(e.target.value)} placeholder="+573001234567" required className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Nombre amigable</label>
                  <input value={friendlyName} onChange={e => setFriendlyName(e.target.value)} className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Twilio Messaging Service SID</label>
                <input value={messagingServiceSid} onChange={e => setMessagingServiceSid(e.target.value)} placeholder="MGxxxxxxxx" className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm font-mono" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={activate} onChange={e => setActivate(e.target.checked)} />
                Activar inmediatamente
              </label>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button type="submit" disabled={!!saving} className={btnPrimary}>
                {saving === true ? <Loader2 className="w-4 h-4 animate-spin" /> : "Registrar línea"}
              </button>
            </form>
          </div>
        ) : tab === "approvals" ? (
          <RegistryTableLayout
            filters={
              <div className="flex gap-2">
                <button type="button" onClick={() => setApprovalFilter("pending_approval")} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${approvalFilter === "pending_approval" ? "bg-amber-500/15 text-amber-200" : "text-gray-400 hover:bg-white/[.06]"}`}>
                  En revisión (Twilio → Meta)
                </button>
                <button type="button" onClick={() => setApprovalFilter("all_pending")} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${approvalFilter === "all_pending" ? "bg-amber-500/15 text-amber-200" : "text-gray-400 hover:bg-white/[.06]"}`}>
                  Incluir rechazadas
                </button>
              </div>
            }
            onRefresh={load}
            refreshing={loading}
            footer={templates.length > 0 ? (
              <RegistryTablePagination
                total={templatesPagination.total}
                rangeStart={templatesPagination.rangeStart}
                rangeEnd={templatesPagination.rangeEnd}
                pageSafe={templatesPagination.pageSafe}
                totalPages={templatesPagination.totalPages}
                pageSize={templatesPagination.pageSize}
                onPageChange={templatesPagination.setPage}
                onPageSizeChange={templatesPagination.setPageSize}
                label="plantillas"
              />
            ) : undefined}
          >
            {templates.length === 0 ? (
              <div className="py-20 text-center">
                <Clock className="w-10 h-10 text-amber-500/40 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No hay plantillas en revisión.</p>
              </div>
            ) : (
              <table className={`${registryTable} min-w-full`}>
                <thead className={registryTableHead}>
                  <tr className={registryTableHeadRow}>
                    <th className={registryTableHeadCell}>Plantilla</th>
                    <th className={registryTableHeadCell}>Cliente</th>
                    <th className={registryTableHeadCell}>Línea Twilio</th>
                    <th className={registryTableHeadCell}>Estado Meta</th>
                    <th className={registryTableHeadCell}>Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTemplates.map(tpl => (
                    <tr key={tpl.id} className={registryTableRow}>
                      <td className={`${registryTableCell} text-sm`}>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[#5b5bf6] shrink-0" />
                          <span className="font-medium">{tpl.template_name}</span>
                        </div>
                        <div className={`${textMuted} text-xs mt-1 line-clamp-2 max-w-sm`}>{tpl.body_source ?? tpl.body_preview}</div>
                        {tpl.rejection_reason && <p className="text-xs text-red-300 mt-1">{tpl.rejection_reason}</p>}
                      </td>
                      <td className={`${registryTableCell} text-xs`}>
                        <div>{tpl.user_nombre || "—"}</div>
                        <div className="text-gray-500">{tpl.user_email}</div>
                      </td>
                      <td className={`${registryTableCell} font-mono text-xs`}>{tpl.channel_e164 ?? "—"}</td>
                      <td className={registryTableCell}>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${templateStatusColor(tpl.status as WhatsAppTemplateStatus)}`}>
                          {templateStatusLabel(tpl.status as WhatsAppTemplateStatus)}
                        </span>
                      </td>
                      <td className={`${registryTableCell} text-xs text-gray-400`}>
                        {tpl.updated_at ? new Date(tpl.updated_at).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </RegistryTableLayout>
        ) : (
          <RegistryTableLayout onRefresh={load} refreshing={loading}>
            {requests.length === 0 ? (
              <p className="text-sm text-gray-500 py-10 text-center">No hay solicitudes pendientes.</p>
            ) : (
              <table className={`${registryTable} min-w-full`}>
                <thead className={registryTableHead}>
                  <tr className={registryTableHeadRow}>
                    <th className={registryTableHeadCell}>Solicitud</th>
                    <th className={registryTableHeadCell}>Cliente</th>
                    <th className={registryTableHeadCell}>Agente</th>
                    <th className={registryTableHeadCell}>Estado</th>
                    <th className={registryTableHeadCell} />
                  </tr>
                </thead>
                <tbody>
                  {requests.map(req => (
                    <tr key={req.id} className={registryTableRow}>
                      <td className={registryTableCell}>
                        <div className="text-sm font-medium text-white">{req.friendly_name || "WhatsApp"}</div>
                        <div className="text-xs font-mono text-gray-500">{req.phone_e164 || "Sin número"}</div>
                        {req.notes && <div className="text-[11px] text-amber-200/60 mt-1 max-w-xs truncate">{req.notes}</div>}
                      </td>
                      <td className={registryTableCell}>
                        <div className="text-xs text-white">{req.profiles?.full_name || "—"}</div>
                        <div className="text-[11px] text-gray-500">{req.profiles?.email}</div>
                      </td>
                      <td className={registryTableCell}>
                        <div className="text-xs text-gray-300">{req.text_agents?.name || "Sin agente"}</div>
                      </td>
                      <td className={registryTableCell}>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          req.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                          req.status === "rejected" ? "bg-red-500/20 text-red-400" :
                          "bg-amber-500/20 text-amber-400"
                        }`}>
                          {req.status}
                        </span>
                      </td>
                      <td className={registryTableCell}>
                        <div className="flex gap-2">
                          {req.status === "pending" && (
                            <>
                              <button
                                type="button"
                                disabled={!!saving}
                                onClick={() => handleProvision(req.id)}
                                className={`${btnPrimary} py-1.5 px-3 text-xs`}
                              >
                                {saving === (req.id as any) ? <Loader2 className="w-3 h-3 animate-spin" /> : "Aprovisionar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(req.id, "rejected")}
                                className={`${btnGhost} py-1.5 px-3 text-xs text-red-400 hover:text-red-300`}
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                          {req.status === "completed" && (
                            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                              Completado
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </RegistryTableLayout>
        )}
      </div>
    </div>
  );
}
