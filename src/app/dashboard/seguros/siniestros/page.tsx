"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, FileWarning } from "lucide-react";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { Badge } from "@/components/ui/Badge";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

interface ChecklistItem {
  documento: string;
  recibido: boolean;
}

interface Siniestro {
  id: string;
  aseguradora: string;
  ramo: string;
  descripcion: string | null;
  fechaAviso: string;
  amparoAfectado: string | null;
  checklistDocumentos: ChecklistItem[];
  estado: string;
}

const ESTADO_OPTIONS = [
  { value: "reportado", label: "Reportado" },
  { value: "documentos_pendientes", label: "Documentos pendientes" },
  { value: "en_forma", label: "En forma" },
  { value: "radicado", label: "Radicado" },
  { value: "pagado", label: "Pagado" },
  { value: "rechazado", label: "Rechazado" },
  { value: "cerrado", label: "Cerrado" }
];

function estadoBadgeVariant(estado: string): "emerald" | "amber" | "danger" | "neutral" {
  if (estado === "pagado" || estado === "en_forma") return "emerald";
  if (estado === "documentos_pendientes" || estado === "reportado") return "amber";
  if (estado === "rechazado") return "danger";
  return "neutral";
}

function daysSince(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export default function SiniestrosTorreControlPage() {
  const [siniestros, setSiniestros] = useState<Siniestro[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/seguros/siniestros", { headers });
    if (res.ok) setSiniestros((await res.json()).siniestros ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleDocumento(id: string, documento: string, recibido: boolean) {
    const headers = await getAuthHeaders();
    await fetch(`/api/seguros/siniestros/${id}/checklist`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ documento, recibido: !recibido })
    });
    await load();
  }

  async function changeEstado(id: string, estado: string) {
    const headers = await getAuthHeaders();
    await fetch(`/api/seguros/siniestros/${id}/estado`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ estado })
    });
    await load();
  }

  return (
    <ChannelListPage
      title="Siniestros"
      description="Torre de control: días desde el aviso, documentos que faltan para que la reclamación quede 'en forma', y el reloj legal de la aseguradora."
      loading={loading}
      onRefresh={load}
      refreshing={loading}
    >
      {siniestros.length === 0 ? (
        <div className="rounded-xl border border-white/[.08] bg-black/20 p-8 text-center text-sm text-gray-500">
          No hay siniestros registrados todavía.
        </div>
      ) : (
        <div className="space-y-3">
          {siniestros.map(s => {
            const total = s.checklistDocumentos.length;
            const recibidos = s.checklistDocumentos.filter(d => d.recibido).length;
            const pct = total > 0 ? Math.round((recibidos / total) * 100) : 0;
            const dias = daysSince(s.fechaAviso);
            const stalled = dias > 15 && s.estado !== "pagado" && s.estado !== "cerrado" && s.estado !== "rechazado";
            const open = expandedId === s.id;

            return (
              <div key={s.id} className="rounded-xl border border-white/[.08] bg-black/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : s.id)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[.03]"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#2463eb]/15 flex items-center justify-center shrink-0">
                    <FileWarning className="w-5 h-5 text-[#6f95f2]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">
                      {s.aseguradora} · {s.ramo}
                      {stalled && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-400">
                          <AlertTriangle className="w-3 h-3" /> {dias} días sin moverse
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Avisado hace {dias} día{dias === 1 ? "" : "s"} · {total > 0 ? `${recibidos}/${total} documentos (${pct}%)` : "sin checklist cargado"}
                    </p>
                  </div>
                  <Badge variant={estadoBadgeVariant(s.estado)}>
                    {ESTADO_OPTIONS.find(o => o.value === s.estado)?.label ?? s.estado}
                  </Badge>
                  {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>

                {open && (
                  <div className="border-t border-white/[.08] p-4 space-y-4">
                    {s.descripcion && <p className="text-xs text-gray-400">{s.descripcion}</p>}

                    {total > 0 && (
                      <div className="space-y-1.5">
                        {s.checklistDocumentos.map(item => (
                          <button
                            key={item.documento}
                            type="button"
                            onClick={() => toggleDocumento(s.id, item.documento, item.recibido)}
                            className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/[.04] text-left"
                          >
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                                item.recibido ? "bg-emerald-500 border-emerald-500" : "border-white/20"
                              }`}
                            >
                              {item.recibido && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className={`text-xs ${item.recibido ? "text-gray-300 line-through" : "text-gray-200"}`}>
                              {item.documento}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-500">Estado:</span>
                      <NoovaSelect
                        value={s.estado}
                        onChange={value => changeEstado(s.id, value)}
                        allowEmpty={false}
                        options={ESTADO_OPTIONS}
                        className="w-56"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ChannelListPage>
  );
}
