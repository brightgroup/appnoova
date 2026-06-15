"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft, Loader2, MessageSquare, RefreshCw,
  SlidersHorizontal, ArrowUpDown, FileJson
} from "lucide-react";
import {
  btnFilterActive, btnFilterGroup, btnFilterIdle, btnGhost, btnIcon, btnIconSm, btnMenuIcon,
  registryContent, registryTable, registryTableHead, registryTableHeadRow,
  registryTableHeadCell, registryTableRowClickable, registryTableCell, registryTableCellFirst,
  registryTableLoading, registryTableEmpty,
  tabActive, tabIdle
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { needsChatAnalysis } from "@/lib/text-chat-analysis";
import {
  channelLabel,
  chatQualityPercent,
  displayChatId,
  downloadChatJson,
  formatChatDateShort,
  formatChatDuration,
  formatChatTimestamp,
  formatMessageTime,
  isSuccessfulChat
} from "@/lib/text-chat-utils";
import type { TextAgentConversationListItem, TextAgentConversationRecord } from "@/types/text-agent-conversation";

type ChatFilter = "todas" | "exitosas" | "activas";

interface ChatRegistryPanelProps {
  agentId: string;
  refreshKey?: number;
}

export function ChatRegistryPanel({ agentId, refreshKey = 0 }: ChatRegistryPanelProps) {
  const [conversations, setConversations] = useState<TextAgentConversationListItem[]>([]);
  const [selected, setSelected] = useState<TextAgentConversationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [dbReady, setDbReady] = useState(true);
  const [detailTab, setDetailTab] = useState<"conversacion" | "comentarios" | "calidad">("conversacion");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("todas");

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/text/agents/conversations?agent_id=${agentId}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al cargar conversaciones");
        return;
      }
      setDbReady(data.dbReady !== false);
      setConversations(data.conversations ?? []);
    } catch {
      setError("Error de red");
    }
    setLoading(false);
  }, [agentId]);

  useEffect(() => { loadList(); }, [loadList, refreshKey]);

  const filtered = useMemo(() => {
    let list = conversations;
    if (filter === "exitosas") {
      list = list.filter(c => isSuccessfulChat(c));
    } else if (filter === "activas") {
      list = list.filter(c => c.status === "active");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.contact_label.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q) ||
        c.status_label.toLowerCase().includes(q) ||
        channelLabel(c.channel).toLowerCase().includes(q)
      );
    }
    return list;
  }, [conversations, filter, search]);

  const pagination = useRegistryPagination(filtered.length, `${filter}-${search}`);
  const pageRows = pagination.pageRows(filtered);

  const runAnalysis = useCallback(async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/text/agents/conversations/analyze?id=${id}`, {
      method: "POST",
      headers
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al analizar");
    return data.conversation as TextAgentConversationRecord;
  }, []);

  const openConversation = async (id: string) => {
    setDetailLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/text/agents/conversations?id=${id}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al cargar detalle");
        return;
      }
      let conversation = data.conversation as TextAgentConversationRecord;
      if (conversation && needsChatAnalysis(conversation, conversation.messages)) {
        try {
          conversation = await runAnalysis(id);
          await loadList();
        } catch {
          /* mostrar detalle con resumen básico si falla el análisis */
        }
      }
      setSelected(conversation);
      setDetailTab("conversacion");
    } catch {
      setError("Error de red");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReanalyze = async () => {
    if (!selected) return;
    setReanalyzing(true);
    setError("");
    try {
      const updated = await runAnalysis(selected.id);
      setSelected(updated);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al analizar");
    } finally {
      setReanalyzing(false);
    }
  };

  if (selected) {
    return (
      <ChatDetailView
        selected={selected}
        detailTab={detailTab}
        setDetailTab={setDetailTab}
        reanalyzing={reanalyzing}
        onBack={() => setSelected(null)}
        onReanalyze={handleReanalyze}
        onDownloadJson={() =>
          downloadChatJson(selected as unknown as Record<string, unknown>, `${displayChatId(selected.id)}.json`)
        }
      />
    );
  }

  if (detailLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-gray-300" /> Cargando conversación...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className={registryContent}>
        <RegistryTableLayout
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar"
          onRefresh={loadList}
          refreshing={loading}
          error={error || undefined}
          alerts={!dbReady ? (
            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
              Ejecuta la migración <code>013_text_agent_conversations.sql</code> en Supabase.
            </div>
          ) : undefined}
          filters={
            <div className={`${btnFilterGroup} w-fit`}>
              {([
                ["activas", "Activas"],
                ["exitosas", "Exitosas"],
                ["todas", "Todas"]
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={filter === id ? btnFilterActive : btnFilterIdle}
                >
                  {label}
                </button>
              ))}
            </div>
          }
          action={
            <button className={btnIcon} title="Columnas">
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          }
          footer={!loading && filtered.length > 0 ? (
            <RegistryTablePagination
              total={pagination.total}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSafe={pagination.pageSafe}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              label="conversaciones"
            />
          ) : undefined}
        >
        {loading ? (
          <div className={registryTableLoading}>
            <Loader2 className="w-5 h-5 animate-spin mr-2 text-gray-300" /> Cargando chats...
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${registryTableEmpty} px-6`}>
            <MessageSquare className="w-10 h-10 text-gray-500 mb-3 mx-auto" />
            <p>No hay conversaciones en este filtro.</p>
            <p className="text-xs text-gray-500 mt-2">Prueba el agente en la pestaña «Probar agente» para generar historial.</p>
          </div>
        ) : (
          <table className={`${registryTable} min-w-[1100px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <Th>Fecha <ArrowUpDown className="w-3 h-3 inline opacity-40" /></Th>
                <Th>Duración</Th>
                <Th>Mensajes</Th>
                <Th>Créditos</Th>
                <Th>Calidad</Th>
                <Th>Canal</Th>
                <Th>Contacto</Th>
                <Th>Estado</Th>
                <Th>Exitosa</Th>
                <Th className="text-center">Exportar</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(conv => {
                const quality = chatQualityPercent(conv);
                const success = isSuccessfulChat(conv);
                return (
                  <tr
                    key={conv.id}
                    onClick={() => openConversation(conv.id)}
                    className={registryTableRowClickable}
                  >
                    <Td mono first>{formatChatDateShort(conv.created_at)}</Td>
                    <Td mono>{formatChatDuration(conv.duration_sec)}</Td>
                    <Td mono>{conv.messages_count}</Td>
                    <Td mono>{conv.credits}</Td>
                    <Td><QualityBar percent={quality} /></Td>
                    <Td className="text-gray-400">{channelLabel(conv.channel)}</Td>
                    <Td>{conv.contact_label}</Td>
                    <Td><span className="text-gray-200">{conv.status}</span></Td>
                    <Td>
                      {success
                        ? <span className="text-gray-200">Sí</span>
                        : <span className="text-gray-400">No</span>}
                    </Td>
                    <Td>
                      <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                        <IconBtn
                          title="Descargar JSON"
                          onClick={async () => {
                            const headers = await getAuthHeaders();
                            const res = await fetch(`/api/text/agents/conversations?id=${conv.id}`, { headers });
                            const data = await res.json();
                            if (data.conversation) {
                              downloadChatJson(data.conversation, `${displayChatId(conv.id)}.json`);
                            }
                          }}
                        >
                          <FileJson className="w-3.5 h-3.5" />
                        </IconBtn>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        </RegistryTableLayout>
      </div>
    </div>
  );
}

function ChatDetailView({
  selected,
  detailTab,
  setDetailTab,
  reanalyzing,
  onBack,
  onReanalyze,
  onDownloadJson
}: {
  selected: TextAgentConversationRecord;
  detailTab: "conversacion" | "comentarios" | "calidad";
  setDetailTab: (t: "conversacion" | "comentarios" | "calidad") => void;
  reanalyzing: boolean;
  onBack: () => void;
  onReanalyze: () => void;
  onDownloadJson: () => void;
}) {
  const quality = chatQualityPercent(selected);

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-noova-main text-white">
      <aside className="w-[40%] min-w-0 shrink-0 border-r border-white/[.10] overflow-y-auto p-5 space-y-5 bg-noova-surface">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className={btnMenuIcon}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold truncate">{selected.contact_label}</h2>
          <button onClick={onDownloadJson} className={`ml-auto ${btnGhost}`}>
            <FileJson className="w-3.5 h-3.5" /> JSON
          </button>
        </div>

        <MetaSection title="Detalle de conversación">
          <MetaRow label="ID de chat" value={displayChatId(selected.id)} mono fullText />
          <MetaRow label="Canal" value={channelLabel(selected.channel)} />
          <MetaRow label="Contacto" value={selected.contact_label} />
          <MetaRow label="Duración" value={formatChatDuration(selected.duration_sec)} />
          <MetaRow label="Fecha inicio" value={formatChatTimestamp(selected.created_at)} />
          <MetaRow label="Mensajes" value={String(selected.messages_count)} />
          <MetaRow label="Modelo" value={selected.llm_model} />
          <MetaRow label="Créditos" value={String(selected.credits)} />
          <MetaRow label="Calidad" value={`${quality}%`} />
          <MetaRow label="Estado" value={selected.status_label} />
          <MetaRow label="Sentimiento" value={selected.user_sentiment} />
        </MetaSection>

        <MetaSection
          title="Resumen y análisis"
          action={
            <button onClick={onReanalyze} disabled={reanalyzing} className={`${btnIconSm} disabled:opacity-50`}>
              <RefreshCw className={`w-3.5 h-3.5 ${reanalyzing ? "animate-spin" : ""}`} />
            </button>
          }
        >
          <p className="text-sm text-gray-200 leading-relaxed">{selected.summary || "N/A"}</p>
        </MetaSection>

        <MetaSection title="Datos extraídos">
          {Object.keys(selected.extracted_data).length ? (
            Object.entries(selected.extracted_data).map(([k, v]) => (
              <div key={k} className="py-2 border-b border-white/[.04] last:border-0">
                <span className="text-xs font-semibold text-gray-100 block">
                  {k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </span>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  {Array.isArray(v) ? v.join(" · ") : String(v ?? "")}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-400">N/A</p>
          )}
        </MetaSection>
      </aside>

      <main className="w-[60%] min-w-0 flex flex-col bg-noova-surface">
        <div className="border-b border-white/[.06] px-5 flex gap-6 shrink-0">
          {(["conversacion", "comentarios", "calidad"] as const).map(id => (
            <button
              key={id}
              onClick={() => setDetailTab(id)}
              className={`py-3 text-sm font-medium border-b-2 capitalize transition-colors ${
                detailTab === id ? tabActive : tabIdle
              }`}
            >
              {id === "conversacion" ? "Conversación" : id === "comentarios" ? "Comentarios" : "Calidad"}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {detailTab === "conversacion" && (
            <div className="space-y-4">
              {selected.messages.length === 0 ? (
                <p className="text-sm text-gray-400">Sin mensajes registrados.</p>
              ) : (
                selected.messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 text-sm ${msg.role === "user" ? "" : ""}`}>
                    <span className="text-gray-500 tabular-nums w-12 shrink-0 text-[11px] pt-0.5">
                      {formatMessageTime(msg.created_at)}
                    </span>
                    <p className="min-w-0">
                      <span className="font-semibold text-gray-100">
                        {msg.role === "user" ? "Usuario" : "Agente"}:{" "}
                      </span>
                      <span className="text-gray-200 whitespace-pre-wrap">{msg.content}</span>
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
          {detailTab === "comentarios" && <p className="text-sm text-gray-400">Próximamente.</p>}
          {detailTab === "calidad" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300">Calidad estimada: {quality}%</p>
              <QualityBar percent={quality} />
              <p className="text-xs text-gray-500 leading-relaxed">
                Basada en cantidad de mensajes, duración y sentimiento del usuario.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`${registryTableHeadCell} ${className}`}>{children}</th>;
}

function Td({ children, className = "", mono, first }: {
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
  first?: boolean;
}) {
  const base = first ? registryTableCellFirst : registryTableCell;
  return (
    <td className={`${base} text-gray-100 whitespace-nowrap ${mono ? "tabular-nums font-mono text-[11px] text-gray-200" : ""} ${className}`}>
      {children}
    </td>
  );
}

function IconBtn({ children, onClick, title }: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button title={title} onClick={onClick} className={btnIconSm}>
      {children}
    </button>
  );
}

function QualityBar({ percent }: { percent: number }) {
  const color = percent >= 80 ? "bg-emerald-500" : percent >= 60 ? "bg-amber-500" : "bg-orange-500";
  return (
    <div className="flex items-center gap-2 min-w-[72px]">
      <div className="flex-1 h-1.5 rounded-full bg-white/[.08] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-gray-400 w-8">{percent}%</span>
    </div>
  );
}

function MetaSection({
  title,
  action,
  children
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
  fullText
}: {
  label: string;
  value: string;
  mono?: boolean;
  fullText?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[118px_1fr] gap-3 text-xs border-b border-white/[.05] last:border-0 ${
        fullText ? "py-2.5 items-start" : "min-h-[40px] items-center"
      }`}
    >
      <span className="text-gray-400 shrink-0 leading-none">{label}</span>
      <span
        className={`text-gray-100 min-w-0 ${
          fullText
            ? "font-mono text-[10px] break-all select-all leading-relaxed"
            : `truncate leading-none ${mono ? "font-mono text-[10px] tracking-tight" : ""}`
        }`}
        title={fullText ? undefined : value}
      >
        {value}
      </span>
    </div>
  );
}
