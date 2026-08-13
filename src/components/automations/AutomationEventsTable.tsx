"use client";

import { Fragment, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Radio } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export interface AutomationEventRow {
  id: string;
  event_type: string;
  status: "sent" | "responded" | "no_response" | "error" | "captured";
  http_status?: number | null;
  latency_ms: number | null;
  error_message?: string | null;
  /** JSON enviado (evento saliente) o recibido (callback entrante) — se muestra expandible, como el inspector de ejecuciones de n8n. */
  request_body?: string | null;
  /** Cuerpo de la respuesta HTTP recibida, si aplica. */
  response_body?: string | null;
  /** Conversación de WhatsApp asociada — clave para agrupar los pasos de una misma ejecución en ExecutionsTable. */
  conversation_id?: string | null;
  created_at: string;
}

function EventStatusBadge({ status }: { status: AutomationEventRow["status"] }) {
  if (status === "sent" || status === "responded") return <Badge variant="emerald" icon={CheckCircle2}>Respuesta recibida</Badge>;
  if (status === "error") return <Badge variant="danger">Sin conexión</Badge>;
  if (status === "captured") return <Badge variant="sky" icon={Radio}>Capturado (sin conector aún)</Badge>;
  return <Badge variant="neutral">Sin respuesta aún</Badge>;
}

/** Repretty-imprime el JSON guardado; si no es JSON válido (ej. HTML de error de un servidor caído), lo muestra tal cual. */
export function prettyPrint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/**
 * Tabla de ejecuciones de automatizaciones, reutilizada por Workflows
 * ("Ejecuciones") y Conectores ("Registros") — clic en una fila para ver el
 * JSON exacto que entró o salió en ese evento, igual que el inspector de
 * ejecuciones de n8n.
 */
export function AutomationEventsTable({
  events,
  emptyLabel = "Sin actividad todavía."
}: {
  events: AutomationEventRow[];
  emptyLabel?: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (events.length === 0) {
    return <p className="text-sm text-gray-500 py-10 text-center">{emptyLabel}</p>;
  }

  return (
    <div className="rounded-xl border border-white/[.08] overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-white/[.03]">
          <tr className="border-b border-white/[.08]">
            <th className="w-8" />
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Evento</th>
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Estado</th>
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Latencia</th>
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Cuándo</th>
          </tr>
        </thead>
        <tbody>
          {events.map(e => {
            const expanded = expandedId === e.id;
            const hasDetail = Boolean(e.request_body || e.response_body || e.error_message);
            return (
              <Fragment key={e.id}>
                <tr
                  onClick={() => hasDetail && setExpandedId(expanded ? null : e.id)}
                  className={`border-b border-white/[.06] last:border-0 hover:bg-white/[.03] ${hasDetail ? "cursor-pointer" : ""}`}
                >
                  <td className="pl-3 py-3 text-gray-500">
                    {hasDetail && (expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)}
                  </td>
                  <td className="px-4 py-3 text-gray-200">{e.event_type}</td>
                  <td className="px-4 py-3"><EventStatusBadge status={e.status} /></td>
                  <td className="px-4 py-3 text-gray-400 tabular-nums">{e.latency_ms ? `${(e.latency_ms / 1000).toFixed(1)} s` : "—"}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(e.created_at).toLocaleString("es-CO")}</td>
                </tr>
                {expanded && (
                  <tr className="bg-black/20 border-b border-white/[.06]">
                    <td />
                    <td colSpan={4} className="px-4 py-4 space-y-3">
                      {e.error_message && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-red-400 mb-1">Error</p>
                          <p className="text-xs text-red-300">{e.error_message}</p>
                        </div>
                      )}
                      {e.request_body && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">JSON enviado/recibido</p>
                          <pre className="text-[11px] font-mono text-gray-300 bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                            {prettyPrint(e.request_body)}
                          </pre>
                        </div>
                      )}
                      {e.response_body && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                            Respuesta{typeof e.http_status === "number" ? ` · HTTP ${e.http_status}` : ""}
                          </p>
                          <pre className="text-[11px] font-mono text-gray-300 bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                            {prettyPrint(e.response_body)}
                          </pre>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Une pasos que pertenecen a la misma interacción: misma conversación y sin más de 10 min entre uno y otro. */
const EXECUTION_GAP_MS = 10 * 60 * 1000;

export interface ExecutionGroup {
  key: string;
  conversationId: string | null;
  /** Orden cronológico ascendente — el primer paso primero. */
  events: AutomationEventRow[];
  startedAt: string;
  label: string;
}

/** Busca un `contact.label`/`contact.phone` en el JSON de cualquiera de los pasos, para identificar al cliente en la lista. */
function extractContactLabel(events: AutomationEventRow[]): string | null {
  for (const e of events) {
    if (!e.request_body) continue;
    try {
      const parsed = JSON.parse(e.request_body) as { contact?: { label?: string; phone?: string } };
      const label = parsed.contact?.label || parsed.contact?.phone;
      if (label) return label;
    } catch {
      // JSON no parseable (ej. respuesta cruda de un sistema externo) — sigue con el siguiente paso.
    }
  }
  return null;
}

/**
 * Agrupa la lista plana de `automation_event_log` en ejecuciones — como el historial de runs de n8n, no filas
 * sueltas. Indexa el grupo abierto de cada conversación por id (no solo "el último grupo") porque los eventos de
 * varios clientes llegan intercalados en la lista global — si solo mirara el último grupo, la respuesta de una
 * conversación podría "cortar" por error el grupo de otra que quedó en medio.
 */
export function groupEventsByExecution(events: AutomationEventRow[]): ExecutionGroup[] {
  const sorted = [...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const groups: ExecutionGroup[] = [];
  const openGroupByConversation = new Map<string, ExecutionGroup>();

  for (const event of sorted) {
    const conversationId = event.conversation_id ?? null;
    const open = conversationId ? openGroupByConversation.get(conversationId) : undefined;
    const lastStep = open?.events[open.events.length - 1];
    const gapMs = lastStep ? new Date(event.created_at).getTime() - new Date(lastStep.created_at).getTime() : Infinity;

    if (open && gapMs <= EXECUTION_GAP_MS) {
      open.events.push(event);
    } else {
      const group: ExecutionGroup = { key: event.id, conversationId, events: [event], startedAt: event.created_at, label: "" };
      groups.push(group);
      if (conversationId) openGroupByConversation.set(conversationId, group);
    }
  }

  return groups
    .map(g => ({
      ...g,
      label: extractContactLabel(g.events) ?? (g.conversationId ? `Conversación ${g.conversationId.slice(0, 8)}` : "Evento sin conversación")
    }))
    .reverse();
}

function ExecutionStatusBadge({ events }: { events: AutomationEventRow[] }) {
  if (events.some(e => e.status === "error")) return <Badge variant="danger">Error</Badge>;
  if (events.some(e => e.status === "responded")) return <Badge variant="emerald" icon={CheckCircle2}>Completa</Badge>;
  if (events.some(e => e.status === "sent")) return <Badge variant="sky">Esperando respuesta</Badge>;
  return <Badge variant="neutral" icon={Radio}>Capturado</Badge>;
}

/**
 * Vista de "Ejecuciones" de un workflow: una fila por interacción real (ej. un
 * cliente mandó una imagen), expandible a los pasos que la componen — igual
 * al historial de runs de n8n. Reutiliza AutomationEventsTable para el
 * detalle de cada paso, así el inspector de JSON no se duplica.
 */
export function ExecutionsTable({
  events,
  emptyLabel = "Sin ejecuciones todavía."
}: {
  events: AutomationEventRow[];
  emptyLabel?: string;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const groups = groupEventsByExecution(events);

  if (groups.length === 0) {
    return <p className="text-sm text-gray-500 py-10 text-center">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {groups.map(group => {
        const expanded = expandedKey === group.key;
        return (
          <div key={group.key} className="rounded-xl border border-white/[.08] overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedKey(expanded ? null : group.key)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[.03]"
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              )}
              <span className="text-sm font-medium text-white truncate flex-1">{group.label}</span>
              <span className="text-[11px] text-gray-500 shrink-0 whitespace-nowrap">
                {group.events.length} paso{group.events.length === 1 ? "" : "s"}
              </span>
              <ExecutionStatusBadge events={group.events} />
              <span className="text-[11px] text-gray-500 shrink-0 whitespace-nowrap">
                {new Date(group.startedAt).toLocaleString("es-CO")}
              </span>
            </button>
            {expanded && (
              <div className="border-t border-white/[.08] bg-black/10 p-3">
                <AutomationEventsTable events={group.events} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
