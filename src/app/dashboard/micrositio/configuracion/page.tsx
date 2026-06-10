"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Save, Loader2, CheckCircle2, Settings2,
  Zap, Eye, ExternalLink, Copy, Link2, Plus, Trash2, Bot, Globe, Lock
} from "lucide-react";
import { btnPrimary, tabActive, tabIdle } from "@/lib/brand-ui";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  DEFAULT_MICROSITE_ACCENT,
  DEFAULT_MICROSITE_BUTTON,
  DEFAULT_MICROSITE_QUICK_ACTIONS
} from "@/lib/microsite-defaults";
import { resolveMicrositeIcon } from "@/lib/microsite-icons";
import { buildMicrositePublicUrl } from "@/lib/microsite-slug";
import type { BrokerMicrositeFormData, BrokerMicrositeRecord, MicrositeQuickAction } from "@/types/microsite";
import type { TextAgentListItem } from "@/types/text-agent";
import { ImageDropzone } from "@/components/microsite/ImageDropzone";
import { MicrositeIconPicker } from "@/components/microsite/MicrositeIconPicker";

type TabId = "general" | "accesos" | "vista";

function parseTab(tab: string | null): TabId {
  if (tab === "general" || tab === "accesos" || tab === "vista") return tab;
  if (tab === "config") return "general";
  return "general";
}

function normalizeRecord(record: BrokerMicrositeRecord): BrokerMicrositeFormData {
  return {
    slug: record.slug,
    company_context_id: record.company_context_id,
    text_agent_id: record.text_agent_id,
    accent_color: record.accent_color,
    button_color: record.button_color,
    logo_url: record.logo_url,
    favicon_url: record.favicon_url,
    agent_display_name: record.agent_display_name,
    quick_actions: record.quick_actions.map(a => ({ ...a })),
    is_published: record.is_published
  };
}

function newQuickAction(): MicrositeQuickAction {
  return {
    id: crypto.randomUUID(),
    label: "",
    prompt: "",
    icon: "MessageCircle",
    enabled: true
  };
}

function ConfigContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabId>(() => parseTab(params.get("tab")));
  const [previewKey, setPreviewKey] = useState(0);

  const setTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    router.replace(`/dashboard/micrositio/configuracion?tab=${tab}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    setActiveTab(parseTab(params.get("tab")));
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState<BrokerMicrositeFormData>({
    slug: "",
    company_context_id: null,
    text_agent_id: null,
    accent_color: DEFAULT_MICROSITE_ACCENT,
    button_color: DEFAULT_MICROSITE_BUTTON,
    logo_url: null,
    favicon_url: null,
    agent_display_name: null,
    quick_actions: DEFAULT_MICROSITE_QUICK_ACTIONS.map(a => ({ ...a })),
    is_published: false
  });

  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const selectedAgent = agents.find(a => a.id === form.text_agent_id);
  const displayTitle = form.agent_display_name?.trim() || selectedAgent?.name || form.slug || "Mi link";
  const previewUrl = `/preview/micrositio?v=${previewKey}`;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const [siteRes, agentsRes] = await Promise.all([
        fetch("/api/microsite", { headers }),
        fetch("/api/text/agents", { headers })
      ]);

      const siteData = await siteRes.json();
      const agentsData = await agentsRes.json();

      if (agentsRes.ok) setAgents(agentsData.agents ?? []);

      if (!siteRes.ok) {
        setError(siteData.error || "Error al cargar el micrositio");
        return;
      }

      if (!siteData.microsite) {
        router.replace("/dashboard/micrositio");
        return;
      }

      const record = siteData.microsite as BrokerMicrositeRecord;
      setForm(normalizeRecord(record));
      setPublicUrl(siteData.public_url ?? buildMicrositePublicUrl(record.slug));
      setSaved(true);
    } catch {
      setError("Error de red al cargar");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSave = async () => {
    if (!form.text_agent_id) {
      setError("Selecciona un agente de texto");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/microsite", {
        method: "POST",
        headers,
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar");
        return;
      }
      if (data.microsite) {
        setForm(normalizeRecord(data.microsite as BrokerMicrositeRecord));
        setPublicUrl(data.public_url ?? buildMicrositePublicUrl(data.microsite.slug));
      }
      setSaved(true);
      setPreviewKey(k => k + 1);
    } catch {
      setError("Error de red al guardar");
    }
    setSaving(false);
  };

  const updateForm = (patch: Partial<BrokerMicrositeFormData>) => {
    setForm(f => ({ ...f, ...patch }));
    setSaved(false);
  };

  const updateQuickAction = (id: string, patch: Partial<MicrositeQuickAction>) => {
    setForm(f => ({
      ...f,
      quick_actions: f.quick_actions.map(a => (a.id === id ? { ...a, ...patch } : a))
    }));
    setSaved(false);
  };

  const addQuickAction = () => {
    setForm(f => ({ ...f, quick_actions: [...f.quick_actions, newQuickAction()] }));
    setSaved(false);
  };

  const removeQuickAction = (id: string) => {
    setForm(f => ({ ...f, quick_actions: f.quick_actions.filter(a => a.id !== id) }));
    setSaved(false);
  };

  const copyUrl = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "general", label: "Configuración", icon: Settings2 },
    { id: "accesos", label: "Accesos rápidos", icon: Zap },
    { id: "vista", label: "Vista previa", icon: Eye }
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando configuración...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-noova-main text-gray-100 min-h-0 overflow-hidden">
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard/agentes-texto"
            className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 hover:text-white shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{displayTitle}</h1>
            <p className="text-xs text-gray-400 truncate">
              {publicUrl}
              {!saved && " · Sin guardar aún"}
              {form.is_published ? " · Publicado" : " · Borrador"}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`${btnPrimary} shrink-0`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      <div className="border-b border-white/[.08] px-6 flex gap-1 overflow-x-auto shrink-0">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive ? tabActive : tabIdle
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}

      {activeTab === "general" && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="w-80 border-r border-white/[.08] p-5 overflow-y-auto shrink-0">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Agente y apariencia</h2>

            <div className="space-y-4">
              <Field label="URL pública (definitiva)">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[.04] border border-white/[.10]">
                  <Link2 className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  <span className="text-xs text-gray-300 font-mono truncate">{publicUrl}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={copyUrl} className="flex items-center gap-1 text-[11px] text-[#5b5bf6] hover:text-[#a5a5ff]">
                    <Copy className="w-3 h-3" /> {copied ? "Copiado" : "Copiar link"}
                  </button>
                  {form.is_published && (
                    <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-[#5b5bf6] hover:text-[#a5a5ff]">
                      <ExternalLink className="w-3 h-3" /> Abrir
                    </a>
                  )}
                </div>
              </Field>

              <Field label="Agente de texto">
                <select
                  value={form.text_agent_id ?? ""}
                  onChange={e => updateForm({ text_agent_id: e.target.value || null })}
                  className={selectCls}
                >
                  <option value="">Seleccionar agente</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                  El agente ya incluye su contexto de marca y personalidad.
                </p>
                <Link href="/dashboard/agentes-texto" className="inline-block mt-2 text-[11px] text-[#5b5bf6] hover:text-[#a5a5ff]">
                  Gestionar agentes →
                </Link>
              </Field>

              <Field label="Nombre del asistente en el chat">
                <input
                  value={form.agent_display_name ?? ""}
                  onChange={e => updateForm({ agent_display_name: e.target.value.trim() || null })}
                  placeholder={selectedAgent?.name ?? "Asistente virtual"}
                  className={inputCls}
                />
              </Field>

              <Field label="Color de acento">
                <ColorInput value={form.accent_color} onChange={v => updateForm({ accent_color: v })} />
              </Field>

              <Field label="Color de botones">
                <ColorInput value={form.button_color} onChange={v => updateForm({ button_color: v })} />
              </Field>

              <PublishStatusCard
                isPublished={form.is_published}
                hasAgent={!!form.text_agent_id}
                publicUrl={publicUrl}
                saved={saved}
                onSelect={published => updateForm({ is_published: published })}
                onCopy={copyUrl}
                copied={copied}
              />
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-xl space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-1">Identidad visual</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Arrastra o adjunta el logo y favicon de tu marca. Se suben automáticamente.
                </p>
              </div>

              <ImageDropzone
                label="Logo"
                hint="PNG, JPG, WebP o SVG · máx. 5 MB"
                value={form.logo_url}
                kind="logo"
                onChange={url => updateForm({ logo_url: url })}
              />

              <ImageDropzone
                label="Favicon"
                hint="Ícono cuadrado · ICO, PNG o SVG"
                value={form.favicon_url}
                kind="favicon"
                onChange={url => updateForm({ favicon_url: url })}
                compact
              />

              {!form.text_agent_id && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 flex gap-2">
                  <Bot className="w-4 h-4 shrink-0 mt-0.5" />
                  Asigna un agente de texto para habilitar la vista previa y publicar tu link.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "accesos" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-sm font-semibold text-gray-300">Accesos rápidos</h2>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Crea botones que el cliente verá al entrar. Define el nombre, el icono y qué debe hacer el agente cuando lo seleccionen.
                </p>
              </div>
              <button
                type="button"
                onClick={addQuickAction}
                className={`${btnPrimary} text-xs py-2 shrink-0`}
              >
                <Plus className="w-4 h-4" /> Nuevo acceso
              </button>
            </div>

            {form.quick_actions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[.12] p-10 text-center">
                <Zap className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400 mb-4">Aún no tienes accesos rápidos</p>
                <button type="button" onClick={addQuickAction} className={`${btnPrimary} mx-auto`}>
                  <Plus className="w-4 h-4" /> Crear el primero
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {form.quick_actions.map((action, index) => {
                  const Icon = resolveMicrositeIcon(action.icon);
                  return (
                    <div key={action.id} className="rounded-xl border border-white/[.10] bg-white/[.02] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span
                            className="w-10 h-10 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: `${form.accent_color}22`, color: form.accent_color }}
                          >
                            <Icon className="w-5 h-5" />
                          </span>
                          <span className="text-xs text-gray-500">Acceso {index + 1}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQuickAction(action.id)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Nombre del botón">
                          <input
                            value={action.label}
                            onChange={e => updateQuickAction(action.id, { label: e.target.value })}
                            placeholder="Ej. Cotizar seguro"
                            className={inputCls}
                          />
                        </Field>

                        <Field label="Icono">
                          <MicrositeIconPicker
                            value={action.icon}
                            accentColor={form.accent_color}
                            onChange={icon => updateQuickAction(action.id, { icon })}
                          />
                        </Field>

                        <Field label="Qué debe hacer el agente" className="md:col-span-2">
                          <textarea
                            value={action.prompt}
                            onChange={e => updateQuickAction(action.id, { prompt: e.target.value })}
                            placeholder="Ej. Ayúdame a cotizar un seguro de auto. Pregúntame los datos que necesites."
                            rows={3}
                            className={`${inputCls} resize-none leading-relaxed`}
                          />
                          <p className="text-[10px] text-gray-500 mt-1">
                            Este mensaje se envía al agente cuando el cliente pulsa el botón.
                          </p>
                        </Field>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "vista" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div>
              <p className="text-sm font-medium text-white">Vista previa en tiempo real</p>
              <p className="text-xs text-gray-400 mt-0.5">
                URL interna · {!saved ? "Guarda los cambios para actualizar" : "Refleja tu configuración guardada"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewKey(k => k + 1)}
                className="px-3 py-1.5 rounded-lg text-xs bg-white/[.06] hover:bg-white/[.10] text-gray-300"
              >
                Actualizar vista
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btnPrimary} text-xs py-1.5`}
              >
                <ExternalLink className="w-3.5 h-3.5" /> Abrir en pestaña
              </a>
            </div>
          </div>

          {!form.text_agent_id ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400 px-6 text-center">
              Asigna un agente en la pestaña Configuración y guarda para ver la vista previa.
            </div>
          ) : (
            <div className="flex-1 min-h-0 p-4 bg-[#1a1a1a]">
              <iframe
                key={previewKey}
                title="Vista previa del micrositio"
                src={previewUrl}
                className="w-full h-full min-h-[480px] rounded-xl border border-white/[.10] bg-white shadow-2xl"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PublishStatusCard({
  isPublished,
  hasAgent,
  publicUrl,
  saved,
  onSelect,
  onCopy,
  copied
}: {
  isPublished: boolean;
  hasAgent: boolean;
  publicUrl: string;
  saved: boolean;
  onSelect: (published: boolean) => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[.10] bg-white/[.02] overflow-hidden">
      <div className={`px-4 py-3 flex items-center justify-between gap-2 ${
        isPublished ? "bg-emerald-500/10 border-b border-emerald-500/20" : "bg-amber-500/10 border-b border-amber-500/20"
      }`}>
        <p className="text-sm font-semibold text-white">Estado del link</p>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${
          isPublished
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-amber-500/20 text-amber-300"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isPublished ? "bg-emerald-400" : "bg-amber-400"}`} />
          {isPublished ? "En vivo" : "Borrador"}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-gray-400 leading-relaxed">
          Elige si tu micrositio es privado (solo vista previa) o visible para tus clientes con el link público.
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onSelect(false)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              !isPublished
                ? "border-[#5b5bf6]/50 bg-[#5b5bf6]/10 ring-1 ring-[#5b5bf6]/30"
                : "border-white/[.08] hover:border-white/[.15] bg-white/[.02]"
            }`}
          >
            <div className="flex items-start gap-3">
              <Lock className={`w-4 h-4 mt-0.5 shrink-0 ${!isPublished ? "text-[#a5a5ff]" : "text-gray-500"}`} />
              <div>
                <p className="text-sm font-medium text-white">Borrador</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                  Solo tú lo ves en la pestaña Vista previa. Nadie puede entrar con el link.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => hasAgent && onSelect(true)}
            disabled={!hasAgent}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              isPublished
                ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                : hasAgent
                  ? "border-white/[.08] hover:border-white/[.15] bg-white/[.02]"
                  : "border-white/[.06] bg-white/[.01] opacity-50 cursor-not-allowed"
            }`}
          >
            <div className="flex items-start gap-3">
              <Globe className={`w-4 h-4 mt-0.5 shrink-0 ${isPublished ? "text-emerald-400" : "text-gray-500"}`} />
              <div>
                <p className="text-sm font-medium text-white">Publicar</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                  {hasAgent
                    ? "Tu link queda activo. Cualquier persona con la URL puede chatear con tu agente."
                    : "Primero asigna un agente de texto arriba."}
                </p>
              </div>
            </div>
          </button>
        </div>

        <div className="rounded-lg bg-black/25 border border-white/[.08] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Link público de tu micrositio
          </p>
          <p className="text-xs font-mono text-white break-all leading-relaxed">{publicUrl}</p>
          <button
            type="button"
            onClick={onCopy}
            className="mt-2 flex items-center gap-1 text-[11px] text-[#5b5bf6] hover:text-[#a5a5ff]"
          >
            <Copy className="w-3 h-3" />
            {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>

        {!saved && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25">
            <Save className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              <strong className="text-amber-100">Paso final:</strong> pulsa{" "}
              <strong>Guardar cambios</strong> arriba a la derecha para {isPublished ? "publicar" : "guardar"} el micrositio.
            </p>
          </div>
        )}

        {saved && isPublished && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-200/90 leading-relaxed">
              Tu micrositio está publicado. Comparte el link con tus clientes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-10 h-10 rounded-lg border border-white/[.10] bg-transparent cursor-pointer"
      />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`${inputCls} flex-1 font-mono`}
        maxLength={7}
      />
    </div>
  );
}

const inputCls =
  "w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50";

const selectCls =
  "w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50 appearance-none cursor-pointer";

export default function MicrositioConfiguracionPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <ConfigContent />
    </Suspense>
  );
}
