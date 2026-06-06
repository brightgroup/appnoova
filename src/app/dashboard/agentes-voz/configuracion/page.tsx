"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Save, Loader2, CheckCircle2, Phone, Settings2,
  BarChart3, History, Radio, LayoutGrid
} from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import { getTemplateMeta } from "@/lib/voice-agent-templates";
import { normalizeVoiceAgentForm } from "@/lib/voice-agent-audio";
import { GEMINI_VOICES, VOICE_MODELS, LLM_MODELS } from "@/lib/voice-agent-options";
import type { VoiceAgentFormData, VoiceAgentRecord } from "@/types/voice-agent";
import type { CompanyContext } from "@/types/company-context";
import { VoiceSessionPanel } from "@/components/voice/VoiceSessionPanel";

type TabId = "probar" | "config" | "analisis" | "registro" | "metrica" | "canales";

function parseTab(tab: string | null): TabId {
  if (tab === "probar" || tab === "config") return tab;
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
    router.replace(`/dashboard/agentes-voz/configuracion?${qs.toString()}`, { scroll: false });
  }, [router, agentIdParam]);

  useEffect(() => {
    setActiveTab(parseTab(params.get("tab")));
  }, [params]);
  const [callActive, setCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [editorMode, setEditorMode] = useState<"preview" | "markdown">("markdown");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState<VoiceAgentFormData>({
    source_template: "lead-qualification",
    name: "",
    prompt: "",
    company_context_id: null,
    voice_name: "Aoede",
    model: VOICE_MODELS[0].id,
    voice_speed: 1.0,
    temperature: 1.0,
    volume: 1.0,
    llm_model: LLM_MODELS[0].id,
    color: null
  });

  const [contexts, setContexts] = useState<CompanyContext[]>([]);

  const meta = getTemplateMeta(form.source_template);
  const assignedContext = contexts.find(c => c.id === form.company_context_id);
  const companyContextText = assignedContext?.content ?? "";

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
      const res = await fetch(`/api/voice/agents?id=${agentIdParam}`, { headers });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al cargar configuración");
        return;
      }

      if (data.agent) {
        const a = data.agent as VoiceAgentRecord;
        setAgentId(a.id);
        setForm(normalizeVoiceAgentForm(a));
        setSaved(true);
      }
    } catch {
      setError("Error de red al cargar el agente");
    }
    setLoading(false);
  }, [agentIdParam]);

  useEffect(() => { loadAgent(); }, [loadAgent]);
  useEffect(() => { loadContexts(); }, [loadContexts]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/voice/agents", {
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
      const newId = data.agent?.id ?? null;
      setAgentId(newId);
      setSaved(true);
    } catch {
      setError("Error de red al guardar");
    }
    setSaving(false);
  };

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "probar", label: "Probar agente", icon: Phone },
    { id: "config", label: "Configuración", icon: Settings2 },
    { id: "analisis", label: "Análisis de llamadas", icon: BarChart3 },
    { id: "registro", label: "Registro de llamadas", icon: History },
    { id: "metrica", label: "Métrica", icon: LayoutGrid },
    { id: "canales", label: "Canales", icon: Radio }
  ];

  if (!agentIdParam) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0d0e14] text-center px-6">
        <p className="text-sm text-gray-400 max-w-md leading-relaxed">
          Cada agente pertenece a tu cuenta. Créalo desde <strong className="text-white">Agentes de voz → Nuevo agente</strong> y ábrelo desde la lista.
        </p>
        <Link
          href="/dashboard/agentes-voz"
          className="mt-4 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold"
        >
          Ir a mis agentes
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0d0e14] text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando configuración...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white min-h-0 overflow-hidden">

      {/* Header */}
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard/agentes-voz"
            className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 hover:text-white shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{form.name}</h1>
            <p className="text-xs text-gray-500">
              Plantilla: {meta.tag} · {meta.description}
              {!saved && " · Sin guardar aún"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {callActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/[.08] border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-xs font-semibold text-emerald-400 tabular-nums">
                {String(Math.floor(callDuration / 60)).padStart(2, "0")}:{String(callDuration % 60).padStart(2, "0")}
              </span>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving || callActive}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60 shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/[.08] px-6 flex gap-1 overflow-x-auto shrink-0">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const disabled = !["config", "probar"].includes(tab.id);

          return (
            <button
              key={tab.id}
              disabled={disabled}
              onClick={() => !disabled && setTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "text-white border-violet-500"
                  : disabled
                    ? "text-gray-700 cursor-not-allowed border-transparent"
                    : "text-gray-500 hover:text-white border-transparent"
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

      {/* Config tab */}
      {activeTab === "config" && (
        <div className="flex-1 flex min-h-0 overflow-hidden">

          {/* Left: voice settings */}
          <div className="w-72 border-r border-white/[.08] p-5 overflow-y-auto shrink-0">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Configuración de voz</h2>

            <div className="space-y-4">
              <Field label="Marca / contexto">
                <select
                  value={form.company_context_id ?? ""}
                  onChange={e => setForm(f => ({
                    ...f,
                    company_context_id: e.target.value || null
                  }))}
                  className={selectCls}
                >
                  <option value="">Sin marca (solo prompt del agente)</option>
                  {contexts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.is_default ? " · predeterminada" : ""}
                    </option>
                  ))}
                </select>
                <Link
                  href="/dashboard/contextos"
                  className="inline-block mt-2 text-[11px] text-violet-400 hover:text-violet-300"
                >
                  Gestionar contextos de marca →
                </Link>
              </Field>

              <Field label="Voz">
                <select
                  value={form.voice_name}
                  onChange={e => setForm(f => ({ ...f, voice_name: e.target.value }))}
                  className={selectCls}
                >
                  {GEMINI_VOICES.map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Modelo de voz">
                <select
                  value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  className={selectCls}
                >
                  {VOICE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </Field>

              <SliderField
                label="Velocidad de voz"
                hint="Reproducción del audio en la prueba (0.5 lento · 1.5 rápido)"
                value={form.voice_speed}
                min={0.5}
                max={1.5}
                step={0.05}
                onChange={v => setForm(f => ({ ...f, voice_speed: v }))}
              />
              <SliderField
                label="Temperatura"
                hint="Creatividad de Lia vía Gemini (0 = precisa · 2 = más libre)"
                value={form.temperature}
                min={0.1}
                max={2}
                step={0.1}
                onChange={v => setForm(f => ({ ...f, temperature: v }))}
              />
              <SliderField
                label="Volumen"
                hint="Nivel de salida en tu navegador durante la sesión"
                value={form.volume}
                min={0}
                max={2}
                step={0.05}
                onChange={v => setForm(f => ({ ...f, volume: v }))}
              />

              <Field label="Modelo de LLM">
                <select
                  value={form.llm_model}
                  onChange={e => setForm(f => ({ ...f, llm_model: e.target.value }))}
                  className={selectCls}
                >
                  {LLM_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-6 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
              <p className="text-[10px] text-violet-300 font-semibold uppercase tracking-wider mb-1">Plantilla base</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Los cambios aquí son solo para tu cuenta. La plantilla original no se modifica.
              </p>
            </div>
          </div>

          {/* Right: prompt editor */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[.06]">
              <Field label="Nombre del agente" className="flex-1 max-w-md mb-0">
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
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
                  className="w-full h-full min-h-[400px] bg-[#12131a] border border-white/[.08] rounded-xl p-4 text-sm text-gray-200 font-mono leading-relaxed resize-none focus:outline-none focus:border-violet-500/40"
                  spellCheck={false}
                />
              ) : (
                <div className="w-full h-full min-h-[400px] bg-[#12131a] border border-white/[.08] rounded-xl p-6 overflow-y-auto prose prose-invert prose-sm max-w-none">
                  <PromptPreview text={form.prompt} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Probar agente — sesión en vivo */}
      {activeTab === "probar" && (
        <VoiceSessionPanel
          sourceTemplate={form.source_template}
          agentId={agentId}
          agentConfig={form}
          companyContext={companyContextText}
          ready={!loading}
          onEndCall={() => setTab("config")}
          onCallStatusChange={(active, sec) => {
            setCallActive(active);
            setCallDuration(sec);
          }}
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
      <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
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
          className="flex-1 h-2 cursor-pointer accent-violet-500 bg-white/[.08] rounded-full appearance-none"
        />
        <span className="text-xs text-gray-300 w-9 text-right tabular-nums font-medium">
          {safe.toFixed(2)}
        </span>
      </div>
      {hint && <p className="text-[10px] text-gray-600 mt-1 leading-snug">{hint}</p>}
    </Field>
  );
}

const selectCls =
  "w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50 appearance-none cursor-pointer";

export default function ConfiguracionPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-[#0d0e14] text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <ConfigContent />
    </Suspense>
  );
}
