"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Save, Loader2, CheckCircle2,
  Zap, Eye, ExternalLink, Copy, Link2, Plus, Trash2, Globe, Lock, Palette
} from "lucide-react";
import { btnPrimary, tabActive, tabIdle } from "@/lib/brand-ui";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  DEFAULT_MICROSITE_ACCENT,
  DEFAULT_MICROSITE_BUTTON,
  DEFAULT_MICROSITE_QUICK_ACTIONS
} from "@/lib/microsite-defaults";
import { resolveMicrositeIcon } from "@/lib/microsite-icons";
import { buildMicrositePublicUrl, buildWidgetEmbedSnippet } from "@/lib/microsite-slug";
import type { BrokerMicrositeFormData, BrokerMicrositeRecord, MicrositeQuickAction } from "@/types/microsite";
import type { TextAgentListItem } from "@/types/text-agent";
import { ImageDropzone } from "@/components/microsite/ImageDropzone";
import { MicrositeIconPicker } from "@/components/microsite/MicrositeIconPicker";
import { MicrositePreviewFrame } from "@/components/microsite/MicrositePreviewFrame";
import { WidgetEmbedPanel } from "@/components/microsite/WidgetEmbedPanel";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

export interface MicrositeConfigPanelProps {
  basePath?: string;
  setupPath?: string;
  backHref?: string;
  includeWidgetEmbed?: boolean;
}

type TabId = "link" | "estilo" | "accesos" | "vista";

function parseTab(tab: string | null): TabId {
  if (tab === "link" || tab === "estilo" || tab === "accesos" || tab === "vista") return tab;
  if (tab === "general" || tab === "config") return "link";
  return "link";
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

function ConfigContent({
  basePath = "/dashboard/canales/mi-link/configuracion",
  setupPath = "/dashboard/canales/mi-link/nuevo",
  backHref = "/dashboard/canales/mi-link",
  includeWidgetEmbed = false
}: MicrositeConfigPanelProps) {
  const router = useRouter();
  const params = useSearchParams();
  const idParam = params.get("id");

  const [activeTab, setActiveTab] = useState<TabId>(() => parseTab(params.get("tab")));
  const [previewKey, setPreviewKey] = useState(0);

  const setTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const query = idParam ? `tab=${tab}&id=${idParam}` : `tab=${tab}`;
    router.replace(`${basePath}?${query}`, { scroll: false });
  }, [router, basePath, idParam]);

  useEffect(() => {
    setActiveTab(parseTab(params.get("tab")));
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

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
  const [recordId, setRecordId] = useState<string | null>(null);
  const selectedAgent = agents.find(a => a.id === form.text_agent_id);
  const displayTitle = form.agent_display_name?.trim() || selectedAgent?.name || form.slug || "Mi link";
  const previewUrl = recordId
    ? `/preview/micrositio?v=${previewKey}&id=${recordId}`
    : `/preview/micrositio?v=${previewKey}`;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const id = idParam;
      const [siteRes, agentsRes] = await Promise.all([
        fetch(id ? `/api/microsite?id=${id}` : "/api/microsite", { headers }),
        fetch("/api/text/agents", { headers })
      ]);

      const siteData = await siteRes.json();
      const agentsData = await agentsRes.json();

      if (agentsRes.ok) setAgents(agentsData.agents ?? []);

      if (!siteRes.ok) {
        setError(siteData.error || "Error al cargar el micrositio");
        return;
      }

      if (id) {
        const record = siteData.microsite as BrokerMicrositeRecord | undefined;
        if (!record) {
          router.replace(setupPath);
          return;
        }
        setRecordId(record.id);
        setForm(normalizeRecord(record));
        setPublicUrl(siteData.public_url ?? buildMicrositePublicUrl(record.slug));
        setSaved(true);
        return;
      }

      // Bookmark viejo sin ?id= (era singleton): usar el único registro si hay
      // exactamente uno, si no mandar a la lista para que elija cuál editar.
      const list = (siteData.microsites as BrokerMicrositeRecord[] | undefined) ?? [];
      if (list.length === 0) {
        router.replace(setupPath);
        return;
      }
      if (list.length > 1) {
        router.replace(backHref);
        return;
      }

      const record = list[0];

      setRecordId(record.id);
      setForm(normalizeRecord(record));
      setPublicUrl(siteData.public_url ?? buildMicrositePublicUrl(record.slug));
      setSaved(true);
    } catch {
      setError("Error de red al cargar");
    } finally {
      setLoading(false);
    }
  }, [router, setupPath, backHref, idParam]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSave = async () => {
    if (form.is_published && !form.text_agent_id) {
      setError("Selecciona un agente de texto antes de publicar");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/microsite", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...form, id: recordId })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar");
        return;
      }
      if (data.microsite) {
        setRecordId(data.microsite.id);
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

  const embedSnippet = form.slug
    ? buildWidgetEmbedSnippet(form.slug, form.button_color)
    : "";

  const copyEmbed = async () => {
    if (!embedSnippet) return;
    await navigator.clipboard.writeText(embedSnippet);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  };

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "link", label: "Link y publicación", icon: Link2 },
    { id: "estilo", label: "Estilo y marca", icon: Palette },
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
            href={backHref}
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

      {activeTab === "link" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-xl mx-auto space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-300">Link y publicación</h2>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Asigna el agente, revisa tu URL definitiva y elige si el micrositio está en borrador o publicado.
              </p>
            </div>

            <PublicUrlPanel
              publicUrl={publicUrl}
              isPublished={form.is_published}
              copied={copied}
              onCopy={copyUrl}
            />

            {includeWidgetEmbed && (
              <WidgetEmbedPanel
                embedSnippet={embedSnippet}
                isPublished={form.is_published}
                hasAgent={!!form.text_agent_id}
                copied={embedCopied}
                onCopy={copyEmbed}
              />
            )}

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
              <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                El agente ya incluye su contexto de marca y personalidad.
              </p>
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
              <h2 className="text-sm font-semibold text-gray-300">Estilo y marca</h2>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Personaliza colores, logo, favicon y cómo se muestra el asistente en el chat.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Color de acento">
                <ColorInput value={form.accent_color} onChange={v => updateForm({ accent_color: v })} />
              </Field>
              <Field label="Color de botones">
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
        !form.text_agent_id ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400 px-6 text-center">
            Asigna un agente en la pestaña Link y publicación y guarda para ver la vista previa.
          </div>
        ) : (
          <MicrositePreviewFrame
            previewUrl={previewUrl}
            publicUrl={publicUrl}
            previewKey={previewKey}
            saved={saved}
            onRefresh={() => setPreviewKey(k => k + 1)}
          />
        )
      )}
    </div>
  );
}

function PublicUrlPanel({
  publicUrl,
  isPublished,
  copied,
  onCopy
}: {
  publicUrl: string;
  isPublished: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/[.10] bg-white/[.02] p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0f7eff]/15 flex items-center justify-center shrink-0">
          <Link2 className="w-4 h-4 text-[#99c9ff]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            URL pública (definitiva)
          </p>
          <p className="text-sm font-mono text-white break-all leading-relaxed">{publicUrl}</p>
          <div className="flex flex-wrap gap-3 mt-2.5">
            <button
              type="button"
              onClick={onCopy}
              className="flex items-center gap-1 text-[11px] text-[#0f7eff] hover:text-[#99c9ff]"
            >
              <Copy className="w-3 h-3" />
              {copied ? "Copiado" : "Copiar link"}
            </button>
            {isPublished ? (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-[#0f7eff] hover:text-[#99c9ff]"
              >
                <ExternalLink className="w-3 h-3" />
                Abrir link
              </a>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-gray-600">
                <ExternalLink className="w-3 h-3" />
                Abrir link al publicar
              </span>
            )}
          </div>
        </div>
      </div>
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
                ? "border-[#0f7eff]/50 bg-[#0f7eff]/10 ring-1 ring-[#0f7eff]/30"
                : "border-white/[.08] hover:border-white/[.15] bg-white/[.02]"
            }`}
          >
            <div className="flex items-start gap-3">
              <Lock className={`w-4 h-4 mt-0.5 shrink-0 ${!isPublished ? "text-[#99c9ff]" : "text-gray-500"}`} />
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
  "w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0f7eff]/50";

export function MicrositeConfigPanel(props: MicrositeConfigPanelProps = {}) {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <ConfigContent {...props} />
    </Suspense>
  );
}
