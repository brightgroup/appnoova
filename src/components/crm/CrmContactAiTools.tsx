"use client";

import { useCallback, useState } from "react";
import {
  Check,
  FileUp,
  Loader2
} from "lucide-react";
import { getAuthHeaders, getAuthToken } from "@/lib/text-agents-api";
import { btnGhost, btnPrimary } from "@/lib/brand-ui";
import { CrmOriQuotePanel } from "@/components/crm/CrmOriQuotePanel";
import type { CrmAiFieldSuggestion } from "@/lib/crm-ai-extract";
import type { CrmContact, CrmTenantLabels } from "@/types/crm";

function FieldGroup({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 mb-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  documento_id: "Documento",
  organizacion: "Organización",
  whatsapp: "WhatsApp",
  telefono: "Teléfono",
  email: "Email",
  ciudad: "Ciudad",
  categorias_interes: "Categorías",
  notes: "Notas"
};

interface CrmContactAiToolsProps {
  contactId: string;
  contact: CrmContact;
  labels?: CrmTenantLabels;
  onContactUpdated: (contact: CrmContact) => void;
  onQuoteBusyChange?: (busy: boolean) => void;
}

function SuggestionsList({
  suggestions,
  selected,
  onToggle,
  onToggleAll
}: {
  suggestions: CrmAiFieldSuggestion[];
  selected: Set<string>;
  onToggle: (field: string) => void;
  onToggleAll: () => void;
}) {
  if (!suggestions.length) {
    return <p className="text-sm text-gray-500">No se encontraron campos nuevos.</p>;
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={onToggleAll} className="text-xs text-[#99c9ff] hover:text-white">
        {selected.size === suggestions.length ? "Desmarcar todos" : "Seleccionar todos"}
      </button>
      <ul className="divide-y divide-white/[.06]">
          {suggestions.map(s => {
            const val = Array.isArray(s.value) ? s.value.join(", ") : s.value;
            const active = selected.has(s.field);
            return (
              <li key={s.field} className="border-b border-white/[.06] last:border-b-0">
                <button
                  type="button"
                  onClick={() => onToggle(s.field)}
                  className={`w-full flex items-start gap-3 py-2.5 text-left transition-colors ${
                    active ? "text-[#99c9ff]" : "hover:text-white"
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 shrink-0 rounded-md border flex items-center justify-center ${
                      active ? "bg-[#0f7eff] border-[#0f7eff]" : "border-white/20"
                    }`}
                  >
                    {active && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-xs text-gray-500">{FIELD_LABELS[s.field] ?? s.field}</span>
                    <span className="block text-sm text-white truncate">{val}</span>
                    <span className="text-[10px] text-amber-300/80">IA · confianza {s.confidence} · pendiente verificar</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
    </div>
  );
}

export function CrmContactAiTools({
  contactId,
  contact,
  labels,
  onContactUpdated,
  onQuoteBusyChange
}: CrmContactAiToolsProps) {
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureSuggestions, setCaptureSuggestions] = useState<CrmAiFieldSuggestion[]>([]);
  const [captureSelected, setCaptureSelected] = useState<Set<string>>(new Set());
  const [captureError, setCaptureError] = useState("");
  const [applying, setApplying] = useState(false);

  const [docLoading, setDocLoading] = useState(false);
  const [docSuggestions, setDocSuggestions] = useState<CrmAiFieldSuggestion[]>([]);
  const [docSelected, setDocSelected] = useState<Set<string>>(new Set());
  const [docError, setDocError] = useState("");

  const [leadAnalyzeLoading, setLeadAnalyzeLoading] = useState(false);
  const [leadAnalyzeError, setLeadAnalyzeError] = useState("");
  const [leadAnalyzeMsg, setLeadAnalyzeMsg] = useState("");

  const runLeadAnalyze = useCallback(async () => {
    setLeadAnalyzeLoading(true);
    setLeadAnalyzeError("");
    setLeadAnalyzeMsg("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/crm/contacts/${contactId}/lead-analyze`, {
        method: "POST",
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        setLeadAnalyzeError(data.error || "Error al analizar pipeline");
        return;
      }
      if (data.created) {
        setLeadAnalyzeMsg("Se creó un lead y se actualizó según la conversación.");
      } else if (data.updated?.length) {
        setLeadAnalyzeMsg(`Lead actualizado: ${data.updated.join(", ")}`);
      } else {
        setLeadAnalyzeMsg("Sin cambios — aún no hay señales suficientes en la conversación.");
      }
    } catch {
      setLeadAnalyzeError("Error de red");
    } finally {
      setLeadAnalyzeLoading(false);
    }
  }, [contactId]);

  const runCapture = useCallback(async () => {
    setCaptureLoading(true);
    setCaptureError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/crm/contacts/${contactId}/ai-capture`, { headers });
      const data = await res.json();
      if (!res.ok) {
        setCaptureError(data.error || "Error al analizar conversación");
        return;
      }
      setCaptureSuggestions(data.suggestions ?? []);
      setCaptureSelected(new Set((data.suggestions ?? []).map((s: CrmAiFieldSuggestion) => s.field)));
    } catch {
      setCaptureError("Error de red");
    } finally {
      setCaptureLoading(false);
    }
  }, [contactId]);

  const applyCapture = async (source: "conversation" | "document", fields: string[], suggestions: CrmAiFieldSuggestion[]) => {
    if (!fields.length) return;
    setApplying(true);
    setCaptureError("");
    setDocError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/crm/contacts/${contactId}/ai-capture`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fields, suggestions, source })
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data.error || "Error al aplicar";
        if (source === "document") setDocError(err);
        else setCaptureError(err);
        return;
      }
      if (data.contact) onContactUpdated(data.contact);
      if (source === "document") {
        setDocSuggestions([]);
        setDocSelected(new Set());
      } else {
        setCaptureSuggestions([]);
        setCaptureSelected(new Set());
      }
    } finally {
      setApplying(false);
    }
  };

  const onDocumentPick = async (file: File) => {
    setDocLoading(true);
    setDocError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const token = await getAuthToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/crm/contacts/${contactId}/document`, {
        method: "POST",
        headers,
        body: form
      });
      const data = await res.json();
      if (!res.ok) {
        setDocError(data.error || "Error al leer documento");
        return;
      }
      setDocSuggestions(data.suggestions ?? []);
      setDocSelected(new Set((data.suggestions ?? []).map((s: CrmAiFieldSuggestion) => s.field)));
    } catch {
      setDocError("Error de red");
    } finally {
      setDocLoading(false);
    }
  };

  return (
    <>
      <FieldGroup
        title="Captura IA desde conversación"
        action={
          contact.inbox_conversation_id ? (
            <button type="button" onClick={runCapture} disabled={captureLoading} className={btnGhost}>
              {captureLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Analizar conversación"}
            </button>
          ) : (
            <span className="text-xs text-gray-500">Sin conversación vinculada</span>
          )
        }
      >
        {captureError && <p className="text-xs text-red-400 mb-2">{captureError}</p>}
        <SuggestionsList
          suggestions={captureSuggestions}
          selected={captureSelected}
          onToggle={f => {
            setCaptureSelected(prev => {
              const next = new Set(prev);
              if (next.has(f)) next.delete(f);
              else next.add(f);
              return next;
            });
          }}
          onToggleAll={() => {
            if (captureSelected.size === captureSuggestions.length) setCaptureSelected(new Set());
            else setCaptureSelected(new Set(captureSuggestions.map(s => s.field)));
          }}
        />
        {captureSuggestions.length > 0 && (
          <button
            type="button"
            disabled={applying || captureSelected.size === 0}
            onClick={() => applyCapture("conversation", [...captureSelected], captureSuggestions)}
            className={`${btnPrimary} mt-3`}
          >
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aplicar seleccionados"}
          </button>
        )}
      </FieldGroup>

      <FieldGroup title="Leer documento (PDF / imagen)">
        <label className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/[.12] px-4 py-6 cursor-pointer hover:border-white/[.22] transition-colors">
          <FileUp className="w-5 h-5 text-gray-500" />
          <span className="text-sm text-gray-400">
            {docLoading ? "Leyendo documento…" : "PDF o imagen (máx 8 MB)"}
          </span>
          <input
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={docLoading}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void onDocumentPick(f);
              e.target.value = "";
            }}
          />
        </label>
        {docError && <p className="text-xs text-red-400 mt-2">{docError}</p>}
        <div className="mt-3">
          <SuggestionsList
            suggestions={docSuggestions}
            selected={docSelected}
            onToggle={f => {
              setDocSelected(prev => {
                const next = new Set(prev);
                if (next.has(f)) next.delete(f);
                else next.add(f);
                return next;
              });
            }}
            onToggleAll={() => {
              if (docSelected.size === docSuggestions.length) setDocSelected(new Set());
              else setDocSelected(new Set(docSuggestions.map(s => s.field)));
            }}
          />
        </div>
        {docSuggestions.length > 0 && (
          <button
            type="button"
            disabled={applying || docSelected.size === 0}
            onClick={() => applyCapture("document", [...docSelected], docSuggestions)}
            className={`${btnPrimary} mt-3`}
          >
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aplicar desde documento"}
          </button>
        )}
      </FieldGroup>

      <FieldGroup
        title="Pipeline IA desde conversación"
        action={
          contact.inbox_conversation_id ? (
            <button type="button" onClick={runLeadAnalyze} disabled={leadAnalyzeLoading} className={btnGhost}>
              {leadAnalyzeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Analizar pipeline"}
            </button>
          ) : (
            <span className="text-xs text-gray-500">Sin conversación vinculada</span>
          )
        }
      >
        {leadAnalyzeError && <p className="text-xs text-red-400 mb-2">{leadAnalyzeError}</p>}
        {leadAnalyzeMsg && <p className="text-xs text-gray-400">{leadAnalyzeMsg}</p>}
        <p className="text-sm text-gray-500">
          ORI lee la conversación de WhatsApp y mueve el lead según los criterios configurados en cada etapa.
        </p>
      </FieldGroup>

      <div id="crm-quote-section">
        <FieldGroup title="Cotización ORI">
          <CrmOriQuotePanel
            quoteEndpoint={`/api/crm/contacts/${contactId}/quote`}
            inboxConversationId={contact.inbox_conversation_id}
            description="Genera una cotización personalizada con ORI según los datos del contacto."
            onQuoteBusyChange={onQuoteBusyChange}
          />
        </FieldGroup>
      </div>
    </>
  );
}

export function useCrmContactCall(contactId: string) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const startCall = async () => {
    if (!confirm("¿Iniciar llamada IA a este contacto?")) return;
    setBusy(true);
    setMessage("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/crm/contacts/${contactId}/call`, { method: "POST", headers });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "No se pudo iniciar la llamada");
        return;
      }
      setMessage(`Marcando ${data.to}…`);
    } catch {
      setMessage("Error de red");
    } finally {
      setBusy(false);
    }
  };

  return { startCall, busy, message };
}
