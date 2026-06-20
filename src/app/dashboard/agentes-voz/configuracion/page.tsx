"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Save, Loader2, CheckCircle2, Phone, Settings2,
  BarChart3, History, Radio, LayoutGrid
} from "lucide-react";
import { btnPrimary, tabActive, tabIdle } from "@/lib/brand-ui";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import { getTemplateMeta } from "@/lib/voice-agent-templates";
import { normalizeVoiceAgentForm } from "@/lib/voice-agent-audio";
import { GEMINI_VOICES, VOICE_MODELS, LLM_MODELS } from "@/lib/voice-agent-options";
import { DEFAULT_ELEVENLABS_VOICE_ID, ELEVENLABS_DEFAULT_VOICES } from "@/lib/elevenlabs/default-voices";
import { VOICE_CREDITS_PER_MINUTE, VOICE_PREMIUM_CREDITS_PER_MINUTE } from "@/lib/billing/pricing";
import type { VoiceAgentFormData, VoiceAgentRecord } from "@/types/voice-agent";
import type { CompanyContext } from "@/types/company-context";
import { AgentTestPanel } from "@/components/voice/AgentTestPanel";
import { CallRegistryPanel } from "@/components/voice/CallRegistryPanel";
import { AgentPhoneChannelPanel } from "@/components/telephony/AgentPhoneChannelPanel";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

type TabId = "probar" | "config" | "analisis" | "registro" | "metrica" | "canales";

function parseTab(tab: string | null): TabId {
  if (tab === "probar" || tab === "config" || tab === "registro" || tab === "canales") return tab;
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
  const [registryRefresh, setRegistryRefresh] = useState(0);
  const [elevenlabsVoices, setElevenlabsVoices] = useState<{ id: string; label: string }[]>([]);

  const isPremium = form.voice_provider === "elevenlabs";

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

  useEffect(() => {
    if (!isPremium) return;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/voice/elevenlabs/voices", { headers });
        const data = await res.json();
        if (res.ok && data.voices?.length) setElevenlabsVoices(data.voices);
      } catch { /* optional */ }
    })();
  }, [isPremium]);

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
      <div className="flex-1 flex flex-col items-center justify-center bg-noova-main text-center px-6">
        <p className="text-sm text-gray-400 max-w-md leading-relaxed">
          Cada agente pertenece a tu cuenta. Créalo desde <strong className="text-white">Agentes de voz → Nuevo agente</strong> y ábrelo desde la lista.
        </p>
        <Link
          href="/dashboard/agentes-voz"
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
            <p className="text-xs text-gray-400">
              Plantilla: {meta.tag} · {meta.description}
              {isPremium ? ` · Premium (${VOICE_PREMIUM_CREDITS_PER_MINUTE} cr/min)` : ` · Estándar (${VOICE_CREDITS_PER_MINUTE} cr/min)`}
              {!saved && " · Sin guardar aún"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {callActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#5b5bf6]/[.08] border border-[#5b5bf6]/25">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#5b5bf6] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#5b5bf6]" />
              </span>
              <span className="text-xs font-semibold text-[#5b5bf6] tabular-nums">
                {String(Math.floor(callDuration / 60)).padStart(2, "0")}:{String(callDuration % 60).padStart(2, "0")}
              </span>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving || callActive}
            className={`${btnPrimary} shrink-0`}
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
          const disabled = !["config", "probar", "registro", "canales"].includes(tab.id);

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

      {/* Config tab */}
      {activeTab === "config" && (
        <div className="flex-1 flex min-h-0 overflow-hidden">

          {/* Left: voice settings */}
          <div className="w-72 border-r border-white/[.08] p-5 overflow-y-auto overflow-x-visible shrink-0">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Configuración de voz</h2>

            <div className="space-y-4">
              <div className={`p-3 rounded-xl border ${isPremium ? "border-amber-500/30 bg-amber-500/10" : "border-[#5b5bf6]/30 bg-[#5b5bf6]/10"}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Motor</p>
                <p className="text-xs text-white font-medium">
                  {isPremium ? "Voz premium" : "Voz estándar"}
                </p>
                <p className="text-[10px] text-gray-500 mt-1">
                  El proveedor se elige al crear el agente.
                </p>
              </div>

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

              {isPremium ? (
                <Field label="Voz premium">
                  <NoovaSelect
                    value={form.elevenlabs_voice_id ?? DEFAULT_ELEVENLABS_VOICE_ID}
                    onChange={v => setForm(f => ({ ...f, elevenlabs_voice_id: v }))}
                    allowEmpty={false}
                    options={(elevenlabsVoices.length ? elevenlabsVoices : ELEVENLABS_DEFAULT_VOICES).map(v => ({
                      value: v.id,
                      label: v.label,
                    }))}
                  />
                </Field>
              ) : (
                <>
                  <Field label="Voz">
                    <NoovaSelect
                      value={form.voice_name}
                      onChange={v => setForm(f => ({ ...f, voice_name: v }))}
                      allowEmpty={false}
                      options={GEMINI_VOICES.map(v => ({ value: v.id, label: v.label }))}
                    />
                  </Field>

                  <Field label="Modelo de voz">
                    <NoovaSelect
                      value={form.model}
                      onChange={v => setForm(f => ({ ...f, model: v }))}
                      allowEmpty={false}
                      options={VOICE_MODELS.map(m => ({ value: m.id, label: m.label }))}
                    />
                  </Field>
                </>
              )}

              {!isPremium && (
              <>
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
                label="Volumen"
                hint="Nivel de salida en tu navegador durante la sesión"
                value={form.volume}
                min={0}
                max={2}
                step={0.05}
                onChange={v => setForm(f => ({ ...f, volume: v }))}
              />

              <Field label="Modelo de LLM">
                <NoovaSelect
                  value={form.llm_model}
                  onChange={v => setForm(f => ({ ...f, llm_model: v }))}
                  allowEmpty={false}
                  options={LLM_MODELS.map(m => ({ value: m.id, label: m.label }))}
                />
              </Field>
              </>
              )}

              <SliderField
                label="Temperatura"
                hint={isPremium ? "Creatividad del agente premium (0 = precisa · 2 = más libre)" : "Creatividad del agente (0 = precisa · 2 = más libre)"}
                value={form.temperature}
                min={0.1}
                max={2}
                step={0.1}
                onChange={v => setForm(f => ({ ...f, temperature: v }))}
              />
            </div>

            <div className="mt-6 p-3 rounded-xl bg-[#5b5bf6]/10 border border-[#5b5bf6]/20">
              <p className="text-[10px] text-[#a5a5ff] font-semibold uppercase tracking-wider mb-1">Plantilla base</p>
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

      {/* Registro de llamadas */}
      {activeTab === "registro" && agentId && (
        <CallRegistryPanel agentId={agentId} refreshKey={registryRefresh} />
      )}

      {activeTab === "canales" && agentId && (
        <AgentPhoneChannelPanel agentId={agentId} isPremium={isPremium} />
      )}

      {/* Probar agente — web o teléfono */}
      {activeTab === "probar" && (
        <AgentTestPanel
          sourceTemplate={form.source_template}
          agentId={agentId}
          agentName={form.name}
          agentConfig={form}
          companyContext={companyContextText}
          ready={!loading && !!agentId}
          onEndCall={() => setTab("registro")}
          onCallSaved={() => setRegistryRefresh(k => k + 1)}
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

export default function ConfiguracionPage() {
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
