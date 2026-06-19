"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Save, Loader2, CheckCircle2, MessageSquare, Settings2,
  History, Radio, BarChart3
} from "lucide-react";
import { btnPrimary, tabActive, tabIdle } from "@/lib/brand-ui";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { getTextTemplateMeta } from "@/lib/text-agent-templates";
import { normalizeTextAgentForm } from "@/lib/text-agent-form";
import { TEXT_LLM_MODELS, TEXT_OUTPUT_TOKEN_OPTIONS } from "@/lib/text-agent-options";
import type { TextAgentFormData, TextAgentRecord } from "@/types/text-agent";
import type { CompanyContext } from "@/types/company-context";
import type { DataTableRecord } from "@/types/data-table";
import { TextAgentTestPanel } from "@/components/text/TextAgentTestPanel";
import { ChatRegistryPanel } from "@/components/text/ChatRegistryPanel";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

type TabId = "probar" | "config" | "analisis" | "registro" | "canales";

function parseTab(tab: string | null): TabId {
  if (tab === "probar" || tab === "config" || tab === "registro") return tab;
  return "config";
}

function ConfigContent() {
  const router = useRouter();
  const params = useSearchParams();
  const agentIdParam = params.get("id");

  const [activeTab, setActiveTab] = useState<TabId>(() => parseTab(params.get("tab")));

  const setTab = useCallback((tab: TabId) => {
    if (!agentIdParam) return;
    setActiveTab(tab);
    const qs = new URLSearchParams();
    qs.set("id", agentIdParam);
    qs.set("tab", tab);
    router.replace(`/dashboard/agentes-texto/configuracion?${qs.toString()}`, { scroll: false });
  }, [router, agentIdParam]);

  useEffect(() => {
    setActiveTab(parseTab(params.get("tab")));
  }, [params]);

  const [editorMode, setEditorMode] = useState<"preview" | "markdown">("markdown");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState<TextAgentFormData>({
    source_template: "customer-assistant",
    name: "",
    prompt: "",
    company_context_id: null,
    data_table_id: null,
    temperature: 0.7,
    llm_model: TEXT_LLM_MODELS[0].id,
    max_output_tokens: 2048,
    color: null
  });

  const [contexts, setContexts] = useState<CompanyContext[]>([]);
  const [dataTables, setDataTables] = useState<DataTableRecord[]>([]);
  const [registryRefresh, setRegistryRefresh] = useState(0);

  const meta = getTextTemplateMeta(form.source_template);

  const loadDataTables = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/data-tables", { headers });
      const data = await res.json();
      if (res.ok) setDataTables(data.tables ?? []);
    } catch { /* optional */ }
  }, []);

  const loadContexts = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/company-contexts", { headers });
      const data = await res.json();
      if (res.ok) setContexts(data.contexts ?? []);
    } catch { /* optional */ }
  }, []);

  const loadAgent = useCallback(async () => {
    if (!agentIdParam) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/text/agents?id=${agentIdParam}`, { headers });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al cargar configuración");
        return;
      }

      if (data.agent) {
        const a = data.agent as TextAgentRecord;
        setAgentId(a.id);
        setForm(normalizeTextAgentForm(a));
        setSaved(true);
      } else {
        setError("Agente no encontrado");
      }
    } catch {
      setError("Error de red al cargar el agente");
    } finally {
      setLoading(false);
    }
  }, [agentIdParam]);

  useEffect(() => { loadAgent(); }, [loadAgent]);
  useEffect(() => { loadContexts(); }, [loadContexts]);
  useEffect(() => { loadDataTables(); }, [loadDataTables]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/text/agents", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...form,
          id: agentId,
          source_template: form.source_template,
          color: meta.color
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar");
        return;
      }
      setAgentId(data.agent?.id ?? null);
      setSaved(true);
    } catch {
      setError("Error de red al guardar");
    }
    setSaving(false);
  };

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "probar", label: "Probar agente", icon: MessageSquare },
    { id: "config", label: "Configuración", icon: Settings2 },
    { id: "analisis", label: "Análisis", icon: BarChart3 },
    { id: "registro", label: "Registro de chats", icon: History },
    { id: "canales", label: "Canales", icon: Radio }
  ];

  if (!agentIdParam) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-noova-main text-center px-6">
        <p className="text-sm text-gray-400 max-w-md leading-relaxed">
          Cada agente pertenece a tu cuenta. Créalo desde{" "}
          <strong className="text-white">Agentes de texto → Nuevo agente</strong> y ábrelo desde la lista.
        </p>
        <Link
          href="/dashboard/agentes-texto"
          className="mt-4 px-4 py-2 rounded-lg bg-[#5b5bf6] hover:bg-[#7070f8] text-white text-sm font-semibold"
        >
          Ir a mis agentes
        </Link>
      </div>
    );
  }

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
            <h1 className="text-lg font-bold truncate">{form.name}</h1>
            <p className="text-xs text-gray-400">
              Plantilla: {meta.tag} · {meta.description}
              {!saved && " · Sin guardar aún"}
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
          const disabled = !["config", "probar", "registro"].includes(tab.id);

          return (
            <button
              key={tab.id}
              disabled={disabled}
              onClick={() => !disabled && setTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? tabActive
                  : disabled
                    ? "text-gray-700 cursor-not-allowed border-transparent"
                    : tabIdle
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

      {activeTab === "config" && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="w-72 border-r border-white/[.08] p-5 overflow-y-auto shrink-0">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Configuración del agente</h2>

            <div className="space-y-4">
              <Field label="Marca / contexto">
                <NoovaSelect
                  value={form.company_context_id ?? ""}
                  onChange={v => setForm(f => ({
                    ...f,
                    company_context_id: v || null
                  }))}
                  allowEmpty={true}
                  emptyLabel="Sin marca (solo prompt del agente)"
                  options={contexts.map(c => ({
                    value: c.id,
                    label: `${c.name}${c.is_default ? " · predeterminada" : ""}`
                  }))}
                />
                <Link
                  href="/dashboard/contextos"
                  className="inline-block mt-2 text-[11px] text-[#5b5bf6] hover:text-[#a5a5ff]"
                >
                  Gestionar contextos de marca →
                </Link>
              </Field>

              <Field label="Tabla de datos (catálogo)">
                <NoovaSelect
                  value={form.data_table_id ?? ""}
                  onChange={v => setForm(f => ({
                    ...f,
                    data_table_id: v || null
                  }))}
                  allowEmpty={true}
                  emptyLabel="Sin tabla (solo prompt)"
                  options={dataTables.map(t => ({
                    value: t.id,
                    label: `${t.name} · ${t.row_count} filas`
                  }))}
                />
                <Link
                  href="/dashboard/tablas"
                  className="inline-block mt-2 text-[11px] text-[#5b5bf6] hover:text-[#a5a5ff]"
                >
                  Gestionar tablas de datos →
                </Link>
                <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
                  El agente usará esta tabla como fuente autorizada de precios y productos.
                </p>
              </Field>

              <SliderField
                label="Temperatura"
                hint="Creatividad del modelo (0.1 = precisa · 2 = más libre)"
                value={form.temperature}
                min={0.1}
                max={2}
                step={0.1}
                onChange={v => setForm(f => ({ ...f, temperature: v }))}
              />

              <Field label="Modelo de LLM">
                <NoovaSelect
                  value={form.llm_model}
                  onChange={v => setForm(f => ({ ...f, llm_model: v }))}
                  allowEmpty={false}
                  options={TEXT_LLM_MODELS.map(m => ({ value: m.id, label: m.label }))}
                />
              </Field>

              <Field label="Máximo de tokens de salida">
                <NoovaSelect
                  value={String(form.max_output_tokens)}
                  onChange={v => setForm(f => ({
                    ...f,
                    max_output_tokens: parseInt(v, 10)
                  }))}
                  allowEmpty={false}
                  options={TEXT_OUTPUT_TOKEN_OPTIONS.map(o => ({
                    value: String(o.id),
                    label: o.label
                  }))}
                />
              </Field>
            </div>

            <div className="mt-6 p-3 rounded-xl bg-[#5b5bf6]/10 border border-[#5b5bf6]/20">
              <p className="text-[10px] text-[#a5a5ff] font-semibold uppercase tracking-wider mb-1">Plantilla base</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Los cambios aquí son solo para tu cuenta. La plantilla original no se modifica.
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[.06]">
              <Field label="Nombre del agente" className="flex-1 max-w-md mb-0">
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50"
                />
              </Field>
              <div className="flex gap-1 ml-4 shrink-0">
                {(["preview", "markdown"] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setEditorMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                      editorMode === mode
                        ? "bg-white/[.10] text-white"
                        : "text-gray-500 hover:text-white"
                    }`}
                  >
                    {mode === "preview" ? "Vista previa" : "Markdown"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 p-5 overflow-hidden">
              {editorMode === "markdown" ? (
                <textarea
                  value={form.prompt}
                  onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                  className="w-full h-full min-h-[400px] bg-noova-surface border border-white/[.08] rounded-xl p-4 text-sm text-gray-200 font-mono leading-relaxed resize-none focus:outline-none focus:border-[#5b5bf6]/40"
                  spellCheck={false}
                />
              ) : (
                <div className="w-full h-full min-h-[400px] bg-noova-surface border border-white/[.08] rounded-xl p-6 overflow-y-auto prose prose-invert prose-sm max-w-none">
                  <PromptPreview text={form.prompt} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "registro" && agentId && (
        <ChatRegistryPanel agentId={agentId} refreshKey={registryRefresh} />
      )}

      {activeTab === "probar" && (
        <TextAgentTestPanel
          agentId={agentId}
          agentName={form.name}
          llmModel={form.llm_model}
          ready={!loading && !!agentId}
          onConversationSaved={() => setRegistryRefresh(k => k + 1)}
        />
      )}
    </div>
  );
}

function PromptPreview({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("# ")) return <h1 key={i} className="text-xl font-bold text-white mt-4 mb-2">{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i} className="text-lg font-semibold text-white mt-3 mb-1">{line.slice(3)}</h2>;
        if (line.startsWith("- ")) return <li key={i} className="text-gray-300 ml-4">{line.slice(2)}</li>;
        if (line.trim() === "") return <br key={i} />;
        return <p key={i} className="text-gray-300 mb-2">{line}</p>;
      })}
    </>
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

function SliderField({
  label, hint, value, min, max, step, onChange
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const safe = Number.isFinite(value) ? value : min;

  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={safe}
          onInput={e => onChange(parseFloat(e.currentTarget.value))}
          className="flex-1 h-2 cursor-pointer accent-[#5b5bf6] bg-white/[.08] rounded-full appearance-none"
        />
        <span className="text-xs text-gray-300 w-9 text-right tabular-nums font-medium">
          {safe.toFixed(2)}
        </span>
      </div>
      {hint && <p className="text-[10px] text-gray-400 mt-1 leading-snug">{hint}</p>}
    </Field>
  );
}

export default function ConfiguracionTextoPage() {
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
