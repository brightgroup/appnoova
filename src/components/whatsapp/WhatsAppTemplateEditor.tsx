"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Send, Save } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  btnGhost,
  btnPrimary,
  accentFocus,
  textMuted
} from "@/lib/brand-ui";
import {
  extractNamedVariables,
  isValidTemplateName,
  normalizeTemplateName,
  templateStatusColor,
  templateStatusLabel
} from "@/lib/whatsapp/template-record";
import { WhatsAppPhonePreview } from "@/components/whatsapp/WhatsAppPhonePreview";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import type {
  WhatsAppTemplateCategory,
  WhatsAppTemplateRecord,
  WhatsAppTemplateStatus
} from "@/types/whatsapp-template";

const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "pt_BR", label: "Português (BR)" }
];

const CATEGORIES: { value: WhatsAppTemplateCategory; label: string }[] = [
  { value: "utility", label: "Utilidad" },
  { value: "marketing", label: "Marketing" },
  { value: "authentication", label: "Autenticación" }
];

const inputClass =
  `w-full bg-white/[.04] border border-white/[.10] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 ${accentFocus}`;

interface WhatsAppTemplateEditorProps {
  mode: "create" | "edit";
  templateId?: string;
  initialTemplate?: WhatsAppTemplateRecord;
  channels: WhatsAppChannelRecord[];
  basePath?: string;
  apiBase?: string;
}

const DEFAULT_BASE_PATH = "/dashboard/canales/whatsapp/plantillas";
const DEFAULT_API_BASE = "/api/whatsapp/templates";

export function WhatsAppTemplateEditor({
  mode,
  templateId,
  initialTemplate,
  channels,
  basePath = DEFAULT_BASE_PATH,
  apiBase = DEFAULT_API_BASE
}: WhatsAppTemplateEditorProps) {
  const router = useRouter();
  const readOnly =
    initialTemplate != null &&
    initialTemplate.status !== "draft" &&
    initialTemplate.status !== "rejected";

  const [channelId, setChannelId] = useState(
    initialTemplate?.whatsapp_channel_id ?? channels[0]?.id ?? ""
  );
  const [templateName, setTemplateName] = useState(initialTemplate?.template_name ?? "");
  const [language, setLanguage] = useState(initialTemplate?.language ?? "es");
  const [category, setCategory] = useState<WhatsAppTemplateCategory>(
    initialTemplate?.category ?? "utility"
  );
  const [bodySource, setBodySource] = useState(
    initialTemplate?.body_source ??
      (initialTemplate
        ? initialTemplate.body_preview.replace(/\{\{(\d+)\}\}/g, (_, n) => {
            const label = initialTemplate.variable_labels[Number(n) - 1];
            return label ? `{{${label}}}` : `{{${n}}}`;
          })
        : "👋 ¡Hola {{contact_name}}! Te escribimos desde {{company_name}} para ayudarte.")
  );
  const [variableExamples, setVariableExamples] = useState<string[]>(
    initialTemplate?.variable_examples ?? []
  );
  const [status, setStatus] = useState<WhatsAppTemplateStatus | null>(
    initialTemplate?.status ?? null
  );
  const [rejectionReason, setRejectionReason] = useState(
    initialTemplate?.rejection_reason ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const variableNames = useMemo(() => extractNamedVariables(bodySource), [bodySource]);

  useEffect(() => {
    setVariableExamples(prev => {
      const next = variableNames.map((name, i) => {
        const existing = prev[i];
        if (existing?.trim()) return existing;
        if (name === "contact_name") return "María";
        if (name === "company_name") return "Noova Seguros";
        return "";
      });
      return next;
    });
  }, [variableNames]);

  const setExample = (index: number, value: string) => {
    setVariableExamples(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const buildPayload = useCallback(
    () => ({
      whatsapp_channel_id: channelId,
      template_name: normalizeTemplateName(templateName),
      language,
      category,
      body_source: bodySource,
      variable_examples: variableExamples
    }),
    [channelId, templateName, language, category, bodySource, variableExamples]
  );

  const apiFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const headers = await getAuthHeaders();
      return fetch(`${apiBase}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    },
    [apiBase]
  );

  const validate = (): string | null => {
    if (!channelId) return "Selecciona un canal WhatsApp";
    const name = normalizeTemplateName(templateName);
    if (!name) return "El nombre es requerido";
    if (!isValidTemplateName(name)) {
      return "Nombre inválido: solo minúsculas, números y guiones bajos";
    }
    if (!bodySource.trim()) return "El cuerpo del mensaje es requerido";
    if (bodySource.length > 1024) return "Máximo 1024 caracteres";
    for (let i = 0; i < variableNames.length; i++) {
      if (!variableExamples[i]?.trim()) {
        return `Agrega un valor de ejemplo para {{${variableNames[i]}}}`;
      }
    }
    return null;
  };

  const handleSaveDraft = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (mode === "create") {
        const res = await apiFetch("", {
          method: "POST",
          body: JSON.stringify({ ...buildPayload(), action: "draft" })
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "No se pudo guardar");
          return;
        }
        router.push(`${basePath}/${data.template.id}`);
      } else if (templateId) {
        const res = await apiFetch(`/${templateId}`, {
          method: "PATCH",
          body: JSON.stringify(buildPayload())
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "No se pudo guardar");
          return;
        }
        setStatus(data.template.status);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (mode === "create") {
        const res = await apiFetch("", {
          method: "POST",
          body: JSON.stringify({ ...buildPayload(), action: "submit" })
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "No se pudo enviar");
          return;
        }
        router.push(`${basePath}/${data.template.id}`);
      } else if (templateId) {
        const res = await apiFetch(`/${templateId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...buildPayload(), action: "submit" })
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "No se pudo enviar");
          return;
        }
        setStatus(data.template.status);
        setRejectionReason(data.template.rejection_reason ?? "");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectedChannel = channels.find(c => c.id === channelId);

  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white min-h-0">
      {/* Header */}
      <div className="border-b border-white/[.08] px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={basePath}
              className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold truncate">
                  {mode === "create" ? "Nueva plantilla" : templateName || "Plantilla"}
                </h1>
                {status && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${templateStatusColor(status)}`}>
                    {templateStatusLabel(status)}
                  </span>
                )}
              </div>
              <p className={`${textMuted} text-xs mt-0.5`}>
                {readOnly
                  ? "Plantilla enviada — se actualiza automáticamente cuando se aprueba"
                  : "Se enviará automáticamente para aprobación"}
              </p>
            </div>
          </div>

          {!readOnly && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || submitting}
                className={btnGhost}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar borrador
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || submitting}
                className={btnPrimary}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar para aprobación
              </button>
            </div>
          )}
        </div>
      </div>

      {rejectionReason && status === "rejected" && (
        <div className="mx-6 mt-4 rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-3 text-sm text-red-300">
          <strong>Motivo de rechazo:</strong> {rejectionReason}
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Layout 3 columnas */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid xl:grid-cols-[1fr_auto_280px] gap-8 max-w-6xl mx-auto">
          {/* Formulario */}
          <div className="space-y-5">
            <p className="text-sm text-gray-400">
              Esta plantilla se usará para enviar notificaciones de WhatsApp fuera de la ventana de 24 h.
            </p>

            {mode === "create" && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Canal WhatsApp</label>
                <select
                  value={channelId}
                  onChange={e => setChannelId(e.target.value)}
                  disabled={readOnly}
                  className={inputClass}
                >
                  <option value="">Seleccionar línea</option>
                  {channels.map(ch => (
                    <option key={ch.id} value={ch.id}>
                      {ch.e164} {ch.friendly_name ? `— ${ch.friendly_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedChannel && mode === "edit" && (
              <div className="rounded-xl border border-white/[.08] bg-white/[.02] px-4 py-3 text-sm">
                <span className="text-gray-500">Canal: </span>
                <span className="font-mono text-gray-200">{selectedChannel.e164}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Nombre</label>
              <input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                disabled={readOnly}
                placeholder="confirmacion_pedido"
                className={`${inputClass} font-mono`}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Solo minúsculas, números y guiones bajos (ej. confirmacion_pedido)
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Idioma</label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  disabled={readOnly}
                  className={inputClass}
                >
                  {LANGUAGES.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Categoría</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as WhatsAppTemplateCategory)}
                  disabled={readOnly}
                  className={inputClass}
                >
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Cuerpo del mensaje</label>
              <textarea
                value={bodySource}
                onChange={e => setBodySource(e.target.value)}
                disabled={readOnly}
                rows={8}
                maxLength={1024}
                placeholder="👋 ¡Hola {{contact_name}}! Te escribimos desde {{company_name}}…"
                className={`${inputClass} resize-none leading-relaxed`}
              />
              <div className="flex justify-between mt-1">
                <p className="text-[11px] text-gray-500">
                  Usa {"{{nombre_variable}}"} para contenido dinámico
                </p>
                <span className={`text-[11px] ${bodySource.length > 950 ? "text-amber-400" : "text-gray-500"}`}>
                  {bodySource.length}/1024
                </span>
              </div>
            </div>

            {initialTemplate?.twilio_content_sid && (
              <div className="rounded-xl border border-white/[.06] bg-white/[.02] px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Referencia interna</p>
                <p className="font-mono text-xs text-gray-400 break-all">{initialTemplate.twilio_content_sid}</p>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="hidden lg:flex flex-col items-center justify-start pt-2">
            <WhatsAppPhonePreview
              bodySource={bodySource}
              variableNames={variableNames}
              variableExamples={variableExamples}
            />
          </div>

          {/* Variables */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Variables</h3>
              <p className={`${textMuted} text-xs mt-1 leading-relaxed`}>
                Agrega valores de ejemplo. Se usan durante la revisión y aprobación.
              </p>
            </div>

            {variableNames.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[.10] px-4 py-8 text-center">
                <p className="text-xs text-gray-500">
                  Escribe {"{{variable}}"} en el cuerpo para agregar variables dinámicas.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {variableNames.map((name, i) => (
                  <div
                    key={name}
                    className="rounded-xl border border-white/[.08] bg-white/[.02] p-3 space-y-2"
                  >
                    <label className="text-xs font-mono text-[#a5a5ff]">{`{{${name}}}`}</label>
                    <input
                      value={variableExamples[i] ?? ""}
                      onChange={e => setExample(i, e.target.value)}
                      disabled={readOnly}
                      placeholder="Valor de ejemplo"
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            )}

            {status === "rejected" && !readOnly && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className={`${btnPrimary} w-full`}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reenviar para aprobación"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
