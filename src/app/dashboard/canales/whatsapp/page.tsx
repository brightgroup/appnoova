"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus, FileText, Link2, MoreVertical, Trash2, Unplug } from "lucide-react";
import {
  btnGhost,
  btnPrimary,
  btnIconSm,
  registryTable,
  registryTableHead,
  registryTableHeadRow,
  registryTableHeadCell,
  registryTableRowClickable,
  registryTableCellFirst,
  registryTableCell,
  registryTableCellRight,
  registryTableEmpty
} from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { RequestWhatsAppLineModal } from "@/components/whatsapp/RequestWhatsAppLineModal";
import {
  WhatsAppEmbeddedSignupModal,
  useWhatsAppEmbeddedSignupEnabled
} from "@/components/whatsapp/WhatsAppEmbeddedSignupModal";
import {
  WhatsAppChannelConfirmModal,
  type WhatsAppChannelConfirmAction
} from "@/components/whatsapp/WhatsAppChannelConfirmModal";
import {
  canDeleteWhatsAppChannel,
  canDisconnectWhatsAppChannel,
  isWhatsAppChannelDisconnected,
  whatsAppChannelStatusLabel,
  whatsAppChannelStatusTone
} from "@/lib/whatsapp/channel-status";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import type { TextAgentListItem } from "@/types/text-agent";

interface WhatsAppRequest {
  id: string;
  status: string;
  friendly_name: string | null;
  phone_e164: string | null;
}

function statusBadgeForChannel(ch: WhatsAppChannelRecord) {
  const tone = whatsAppChannelStatusTone(ch);
  if (tone === "active") return "bg-emerald-500/15 text-emerald-300";
  if (tone === "disconnected" || tone === "suspended") return "bg-red-500/15 text-red-300";
  return "bg-amber-500/15 text-amber-300";
}

function statusBadge(status: string) {
  if (status === "active" || status === "completed") return "bg-emerald-500/15 text-emerald-300";
  if (status === "suspended" || status === "rejected") return "bg-red-500/15 text-red-300";
  return "bg-amber-500/15 text-amber-300";
}

function statusTextForChannel(ch: WhatsAppChannelRecord) {
  return whatsAppChannelStatusLabel(ch);
}

function statusText(status: string) {
  if (status === "active" || status === "completed") return "Activo";
  if (status === "suspended") return "Suspendido";
  if (status === "rejected") return "Rechazado";
  return "Pendiente";
}

export default function WhatsAppListPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<WhatsAppChannelRecord[]>([]);
  const [requests, setRequests] = useState<WhatsAppRequest[]>([]);
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dbReady, setDbReady] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [reconnectChannel, setReconnectChannel] = useState<WhatsAppChannelRecord | null>(null);
  const [menuChannelId, setMenuChannelId] = useState<string | null>(null);
  const [confirmChannel, setConfirmChannel] = useState<WhatsAppChannelRecord | null>(null);
  const [confirmAction, setConfirmAction] = useState<WhatsAppChannelConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const embeddedSignupEnabled = useWhatsAppEmbeddedSignupEnabled();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [chRes, agentsRes, reqRes] = await Promise.all([
        fetch("/api/whatsapp/channels", { headers }),
        fetch("/api/text/agents", { headers }),
        fetch("/api/whatsapp/requests", { headers })
      ]);
      const chData = await chRes.json();
      const agentsData = await agentsRes.json();
      const reqData = await reqRes.json();

      if (chRes.ok) {
        setChannels(chData.channels ?? []);
        setDbReady(chData.dbReady !== false);
      }
      if (agentsRes.ok) setAgents(agentsData.agents ?? []);
      if (reqRes.ok) setRequests(reqData.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openConnect = (channel?: WhatsAppChannelRecord | null) => {
    setReconnectChannel(channel ?? null);
    setConnectOpen(true);
  };

  const closeConnect = () => {
    setConnectOpen(false);
    setReconnectChannel(null);
  };

  const openConfirm = (channel: WhatsAppChannelRecord, action: WhatsAppChannelConfirmAction) => {
    setMenuChannelId(null);
    setConfirmChannel(channel);
    setConfirmAction(action);
  };

  const closeConfirm = () => {
    if (actionLoading) return;
    setConfirmChannel(null);
    setConfirmAction(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmChannel || !confirmAction) return;
    setActionLoading(true);
    try {
      const headers = await getAuthHeaders();
      if (confirmAction === "disconnect") {
        const res = await fetch(`/api/whatsapp/channels/${confirmChannel.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ action: "disconnect" })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo desconectar");
      } else {
        const res = await fetch(`/api/whatsapp/channels/${confirmChannel.id}`, {
          method: "DELETE",
          headers
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo eliminar");
      }
      setConfirmChannel(null);
      setConfirmAction(null);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Error en la operación");
    } finally {
      setActionLoading(false);
    }
  };

  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.name);
    return m;
  }, [agents]);

  const filtered = channels.filter(ch => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const agent = ch.text_agent_id ? agentMap.get(ch.text_agent_id) ?? "" : "";
    return (
      ch.e164.includes(q) ||
      (ch.friendly_name ?? "").toLowerCase().includes(q) ||
      agent.toLowerCase().includes(q)
    );
  });

  const pagination = useRegistryPagination(filtered.length, search);
  const pageRows = pagination.pageRows(filtered);

  return (
    <ChannelListPage
      title="WhatsApp"
      description="Conecta tu WhatsApp Business en minutos. Noova configura mensajería, inbox e IA automáticamente."
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar número o agente"
      onRefresh={load}
      refreshing={loading}
      action={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/canales/whatsapp/plantillas" className={btnGhost}>
            <FileText className="w-4 h-4" /> Plantillas
          </Link>
          {embeddedSignupEnabled ? (
            <button onClick={() => openConnect()} className={`${btnPrimary} py-2`}>
              <Link2 className="w-4 h-4" /> Conectar WhatsApp
            </button>
          ) : (
            <button onClick={() => setModalOpen(true)} className={`${btnPrimary} py-2`}>
              <Plus className="w-4 h-4" /> Solicitar línea
            </button>
          )}
        </div>
      }
      footer={
        filtered.length > 0 ? (
          <RegistryTablePagination
            total={pagination.total}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            pageSafe={pagination.pageSafe}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            label="líneas"
          />
        ) : undefined
      }
    >
      <RequestWhatsAppLineModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={load}
      />
      <WhatsAppEmbeddedSignupModal
        open={connectOpen}
        onClose={closeConnect}
        onSuccess={load}
        reconnectChannel={reconnectChannel}
      />

      <WhatsAppChannelConfirmModal
        channel={confirmChannel}
        action={confirmAction}
        loading={actionLoading}
        onClose={closeConfirm}
        onConfirm={() => void handleConfirmAction()}
      />

      {!dbReady && (
        <div className="mx-6 mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Falta la migración de WhatsApp en Supabase (021_whatsapp_channels.sql).
        </div>
      )}

      {requests.some(r => r.status === "pending" || r.status === "approved") && (
        <div className="mx-6 mt-6 mb-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Solicitudes en curso</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {requests.filter(r => r.status === "pending" || r.status === "approved").map(req => (
              <div key={req.id} className="bg-white/[.02] border border-white/[.08] rounded-xl p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{req.friendly_name || "WhatsApp"}</p>
                  <p className="text-xs text-gray-500 truncate">{req.phone_e164 || "Número por asignar"}</p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusBadge(req.status)}`}>
                  {statusText(req.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={registryTableEmpty}>
          <MessageCircle className="w-10 h-10 text-emerald-500/50 mb-3 mx-auto" />
          <p className="text-sm text-gray-400 mb-2 max-w-md mx-auto">
            {search
              ? "No hay resultados"
              : embeddedSignupEnabled
                ? "Conecta tu número de WhatsApp Business en unos minutos. Todo queda listo dentro de Noova."
                : "Solicita activación y nuestro equipo conectará tu línea."}
          </p>
          {!search && embeddedSignupEnabled && (
            <>
              <button
                onClick={() => openConnect()}
                className={`${btnPrimary} py-2 mt-3`}
              >
                <Link2 className="w-4 h-4" /> Conectar WhatsApp
              </button>
              <p className="text-xs text-gray-600 mt-4">
                ¿Necesitas ayuda manual?{" "}
                <button type="button" onClick={() => setModalOpen(true)} className="text-[#a5a5ff] hover:underline">
                  Solicitar activación asistida
                </button>
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4 px-6">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Líneas</h3>
          <table className={`${registryTable} min-w-[820px]`}>
          <thead className={registryTableHead}>
            <tr className={registryTableHeadRow}>
              <th className={registryTableHeadCell}>Línea</th>
              <th className={registryTableHeadCell}>Número</th>
              <th className={registryTableHeadCell}>Agente</th>
              <th className={registryTableHeadCell}>Estado</th>
              <th className={registryTableHeadCell} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(ch => {
              const disconnected = isWhatsAppChannelDisconnected(ch);
              const showDelete = canDeleteWhatsAppChannel(ch);
              const showDisconnect = canDisconnectWhatsAppChannel(ch);
              return (
              <tr
                key={ch.id}
                className={registryTableRowClickable}
                onClick={() => router.push(`/dashboard/canales/whatsapp/${ch.id}`)}
              >
                <td className={registryTableCellFirst}>
                  <div className="flex items-center gap-3">
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-medium text-white">
                      {ch.friendly_name || "WhatsApp"}
                    </span>
                  </div>
                </td>
                <td className={`${registryTableCell} font-mono text-sm`}>{ch.e164}</td>
                <td className={registryTableCell}>
                  {ch.text_agent_id ? agentMap.get(ch.text_agent_id) ?? "—" : "Sin asignar"}
                </td>
                <td className={registryTableCell}>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${statusBadgeForChannel(ch)}`}
                  >
                    {statusTextForChannel(ch)}
                  </span>
                </td>
                <td className={registryTableCellRight} onClick={e => e.stopPropagation()}>
                  <NoovaAnchoredMenu
                    open={menuChannelId === ch.id}
                    onClose={() => setMenuChannelId(null)}
                    anchor={
                      <button
                        type="button"
                        className={btnIconSm}
                        onClick={e => {
                          e.stopPropagation();
                          setMenuChannelId(prev => (prev === ch.id ? null : ch.id));
                        }}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    }
                  >
                    <NoovaListMenuItem onClick={() => router.push(`/dashboard/canales/whatsapp/${ch.id}`)}>
                      Abrir configuración
                    </NoovaListMenuItem>
                    {embeddedSignupEnabled && disconnected && (
                      <NoovaListMenuItem
                        onClick={() => {
                          setMenuChannelId(null);
                          openConnect(ch);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Link2 className="w-3.5 h-3.5" /> Reconectar
                        </span>
                      </NoovaListMenuItem>
                    )}
                    {showDisconnect && (
                      <NoovaListMenuItem onClick={() => openConfirm(ch, "disconnect")}>
                        <span className="flex items-center gap-2">
                          <Unplug className="w-3.5 h-3.5" /> Desconectar
                        </span>
                      </NoovaListMenuItem>
                    )}
                    {showDelete && (
                      <NoovaListMenuItem danger onClick={() => openConfirm(ch, "delete")}>
                        <span className="flex items-center gap-2">
                          <Trash2 className="w-3.5 h-3.5" /> Eliminar
                        </span>
                      </NoovaListMenuItem>
                    )}
                  </NoovaAnchoredMenu>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    )}
  </ChannelListPage>
);
}
