"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft, Save, Loader2, CheckCircle2, ExternalLink, Palette, Zap, Code2,
  Globe, Lock, Plus, Trash2
} from "lucide-react";
import { btnPrimary, tabActive, tabIdle } from "@/lib/brand-ui";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  DEFAULT_MICROSITE_ACCENT,
  DEFAULT_MICROSITE_BUTTON,
  DEFAULT_MICROSITE_QUICK_ACTIONS
} from "@/lib/microsite-defaults";
import { resolveMicrositeIcon } from "@/lib/microsite-icons";
import { buildWidgetEmbedSnippet, buildWidgetPageUrl } from "@/lib/microsite-slug";
import type {
  BrokerWebWidgetFormData,
  BrokerWebWidgetRecord,
  MicrositeQuickAction
} from "@/types/microsite";
import type { TextAgentListItem } from "@/types/text-agent";
import { WidgetEmbedPanel } from "@/components/microsite/WidgetEmbedPanel";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { MicrositeIconPicker } from "@/components/microsite/MicrositeIconPicker";
import { ImageDropzone } from "@/components/microsite/ImageDropzone";

type TabId = "instalacion" | "publicacion" | "estilo" | "accesos";

function parseTab(tab: string | null): TabId {
  if (tab === "instalacion" || tab === "publicacion" || tab === "estilo" || tab === "accesos") {
    return tab;
  }
  return "instalacion";
}

function normalizeRecord(record: BrokerWebWidgetRecord): BrokerWebWidgetFormData {
  return {
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

function WidgetConfigContent({
  backHref = "/dashboard/canales/widget"
}: {
  backHref?: string;
} = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => parseTab(params.get("tab")));

  const setTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    router.replace(`/dashboard/canales/widget/configuracion?tab=${tab}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    setActiveTab(parseTab(params.get("tab")));
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");
  const [embedCopied, setEmbedCopied] = useState(false);
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [slug, setSlug] = useState("");

  const [form, setForm] = useState<BrokerWebWidgetFormData>({
    text_agent_id: null,
    accent_color: DEFAULT_MICROSITE_ACCENT,
    button_color: DEFAULT_MICROSITE_BUTTON,
    logo_url: null,
    favicon_url: null,
    agent_display_name: null,
    quick_actions: DEFAULT_MICROSITE_QUICK_ACTIONS.map(a => ({ ...a })),
    is_published: false
  });

  const selectedAgent = agents.find(a => a.id === form.text_agent_id);
  const displayTitle = form.agent_display_name?.trim() || selectedAgent?.name || "Widget web";

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const [widgetRes, agentsRes] = await Promise.all([
        fetch("/api/widget", { headers }),
        fetch("/api/text/agents", { headers })
      ]);
      const widgetData = await widgetRes.json();
      const agentsData = await agentsRes.json();

      if (agentsRes.ok) setAgents(agentsData.agents ?? []);

      if (!widgetRes.ok) {
        setError(widgetData.error || "Error al cargar");
        return;
      }

      if (!widgetData.widget) {
        router.replace("/dashboard/canales/widget/nuevo");
        return;
      }

      const record = widgetData.widget as BrokerWebWidgetRecord;
      setSlug(record.slug);
      setForm(normalizeRecord(record));
      setSaved(true);
    } catch {
      setError("Error de red al cargar");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSave = async () => {
    if (form.is_published && !form.text_agent_id) {
      setError("Selecciona un agente de texto antes de publicar el widget");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/widget", {
        method: "POST",
        headers,
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar");
        return;
      }
      if (data.widget) {
        setForm(normalizeRecord(data.widget as BrokerWebWidgetRecord));
      }
      setSaved(true);
    } catch {
      setError("Error de red al guardar");
    }
    setSaving(false);
  };

  const updateForm = (patch: Partial<BrokerWebWidgetFormData>) => {
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

  const embedSnippet = slug ? buildWidgetEmbedSnippet(slug, form.button_color) : "";
  const widgetPreviewUrl = slug ? buildWidgetPageUrl(slug) : "";

  const copyEmbed = async () => {
    if (!embedSnippet) return;
    await navigator.clipboard.writeText(embedSnippet);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  };

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "instalacion", label: "Instalación", icon: Code2 },
    { id: "publicacion", label: "Agente y publicación", icon: Globe },
    { id: "estilo", label: "Estilo", icon: Palette },
    { id: "accesos", label: "Accesos rápidos", icon: Zap }
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando widget...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-noova-main text-gray-100 min-h-0 overflow-hidden">
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={backHref}
            className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 hover:text-white shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{displayTitle}</h1>
            <p className="text-xs text-gray-400 truncate">
              Widget web · /{slug}
              {!saved && " · Sin guardar aún"}
              {form.is_published ? " · Publicado" : " · Borrador"}
            </p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} className={`${btnPrimary} shrink-0`}>
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

      {activeTab === "instalacion" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-xl mx-auto space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-300">Instalación</h2>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                El widget tiene su propia configuración (agente, colores y accesos). Las conversaciones
                se etiquetan como <span className="text-gray-300">Widget web</span> en el inbox,
                separadas de Mi Link.
              </p>
            </div>

            <WidgetEmbedPanel
              embedSnippet={embedSnippet}
              isPublished={form.is_published}
              hasAgent={!!form.text_agent_id}
              copied={embedCopied}
              onCopy={copyEmbed}
            />

            {widgetPreviewUrl && (
              <div className="rounded-xl border border-white/[.10] bg-white/[.02] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Vista previa directa
                </p>
                {form.is_published ? (
                  <a
                    href={widgetPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-[#0f7eff] hover:text-[#99c9ff] font-mono break-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    {widgetPreviewUrl}
                  </a>
                ) : (
                  <p className="text-xs text-gray-600">
                    Publica el widget en la pestaña Agente y publicación para activar la vista previa.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "publicacion" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-xl mx-auto space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-300">Agente y publicación</h2>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Elige qué agente atiende el widget y si está activo en sitios externos.
                No afecta la publicación de Mi Link.
              </p>
            </div>

            <Field label="Agente de texto">
              <NoovaSelect
                value={form.text_agent_id ?? ""}
                onChange={v => {
                  const nextId = v || null;
                  const prevName = agents.find(a => a.id === form.text_agent_id)?.name?.trim() ?? "";
                  const nextName = agents.find(a => a.id === nextId)?.name?.trim() ?? "";
                  const currentDisplay = form.agent_display_name?.trim() ?? "";
                  const shouldSyncName =
                    !currentDisplay || (Boolean(prevName) && currentDisplay === prevName);
                  updateForm({
                    text_agent_id: nextId,
                    ...(shouldSyncName ? { agent_display_name: nextName || null } : {})
                  });
                }}
                allowEmpty={true}
                emptyLabel="Seleccionar agente"
                options={agents.map(a => ({ value: a.id, label: a.name }))}
              />
              <Link href="/dashboard/agentes-texto" className="inline-block mt-2 text-[11px] text-[#0f7eff] hover:text-[#99c9ff]">
                Gestionar agentes →
              </Link>
            </Field>

            <PublishStatusCard
              isPublished={form.is_published}
              hasAgent={!!form.text_agent_id}
              saved={saved}
              onSelect={published => updateForm({ is_published: published })}
            />
          </div>
        </div>
      )}

      {activeTab === "estilo" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-xl mx-auto space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-300">Estilo del widget</h2>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Colores, logo, favicon y nombre del asistente propios del widget.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Color de acento">
                <ColorInput value={form.accent_color} onChange={v => updateForm({ accent_color: v })} />
              </Field>
              <Field label="Color de la burbuja">
                <ColorInput value={form.button_color} onChange={v => updateForm({ button_color: v })} />
              </Field>
            </div>

            <Field label="Nombre del asistente en el chat">
              <input
                value={form.agent_display_name ?? ""}
                onChange={e => updateForm({ agent_display_name: e.target.value.trim() || null })}
                placeholder={selectedAgent?.name ?? "Asistente virtual"}
                className={inputCls}
              />
              <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                Si lo dejas vacío o igual al agente, al cambiar de agente se actualiza solo.
                Solo se conserva si escribes un nombre distinto (p. ej. “Asistente”).
              </p>
            </Field>

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
                  Botones que verán los visitantes al abrir el widget. Independientes de los de Mi Link.
                </p>
              </div>
              <button type="button" onClick={addQuickAction} className={`${btnPrimary} text-xs py-2 shrink-0`}>
                <Plus className="w-4 h-4" /> Nuevo acceso
              </button>
            </div>

            {form.quick_actions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[.12] p-10 text-center">
                <Zap className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400 mb-4">Aún no tienes accesos rápidos en el widget</p>
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
                            placeholder="Ej. Ayúdame a cotizar un seguro de auto."
                            rows={3}
                            className={`${inputCls} resize-none leading-relaxed`}
                          />
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
    </div>
  );
}

function PublishStatusCard({
  isPublished,
  hasAgent,
  saved,
  onSelect
}: {
  isPublished: boolean;
  hasAgent: boolean;
  saved: boolean;
  onSelect: (published: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-white/[.10] bg-white/[.02] overflow-hidden">
      <div className={`px-4 py-3 flex items-center justify-between gap-2 ${
        isPublished ? "bg-emerald-500/10 border-b border-emerald-500/20" : "bg-amber-500/10 border-b border-amber-500/20"
      }`}>
        <p className="text-sm font-semibold text-white">Estado del widget</p>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${
          isPublished ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isPublished ? "bg-emerald-400" : "bg-amber-400"}`} />
          {isPublished ? "En vivo" : "Borrador"}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-gray-400 leading-relaxed">
          El widget puede estar publicado aunque Mi Link esté en borrador, y viceversa.
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onSelect(false)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              !isPublished
                ? "border-[#0f7eff]/50 bg-[#0f7eff]/10 ring-1 ring-[#0f7eff]/30"
                : "border-white/[.08] hover:border-white/[.15] bg-white/[.02]"
            }`}
          >
            <div className="flex items-start gap-3">
              <Lock className={`w-4 h-4 mt-0.5 shrink-0 ${!isPublished ? "text-[#99c9ff]" : "text-gray-500"}`} />
              <div>
                <p className="text-sm font-medium text-white">Borrador</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                  El código de instalación no funcionará en sitios externos.
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
                    ? "El widget queda activo en los sitios donde instales el código."
                    : "Primero asigna un agente de texto arriba."}
                </p>
              </div>
            </div>
          </button>
        </div>

        {!saved && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25">
            <Save className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              Pulsa <strong>Guardar cambios</strong> arriba para aplicar el estado del widget.
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
  "w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0f7eff]/50";

export function WidgetChannelPanel({
  backHref = "/dashboard/canales/widget"
}: {
  backHref?: string;
} = {}) {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <WidgetConfigContent backHref={backHref} />
    </Suspense>
  );
}
