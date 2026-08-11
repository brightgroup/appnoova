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
