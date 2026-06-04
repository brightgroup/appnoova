"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Save, Loader2, CheckCircle2, Phone, Settings2,
  FileText, BarChart3, History, Radio, LayoutGrid
} from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import { getTemplateMeta } from "@/lib/voice-agent-templates";
import { GEMINI_VOICES, VOICE_MODELS, LLM_MODELS } from "@/lib/voice-agent-options";
import type { VoiceAgentFormData, VoiceAgentRecord } from "@/types/voice-agent";

type TabId = "contexto" | "probar" | "config" | "analisis" | "registro" | "metrica" | "canales";

function ConfigContent() {
  const params = useSearchParams();
  const templateId = params.get("template") || "lead-qualification";
  const meta = getTemplateMeta(templateId);

  const [activeTab, setActiveTab] = useState<TabId>("config");
  const [editorMode, setEditorMode] = useState<"preview" | "markdown">("markdown");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState<VoiceAgentFormData>({
    template_id: templateId,
    name: meta.name,
    prompt: meta.prompt,
    voice_name: "Aoede",
    model: VOICE_MODELS[0].id,
    voice_speed: 1.0,
    temperature: 1.0,
    volume: 1.0,
    llm_model: LLM_MODELS[0].id,
    color: meta.color
  });

  const loadAgent = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/voice/agents?template_id=${templateId}`, { headers });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al cargar configuración");
        return;
      }

      if (data.agent) {
        const a = data.agent as VoiceAgentRecord;
        setAgentId(a.id);
        setForm({
          template_id: a.template_id,
          name: a.name,
          prompt: a.prompt,
          voice_name: a.voice_name,
          model: a.model,
          voice_speed: Number(a.voice_speed),
          temperature: Number(a.temperature),
          volume: Number(a.volume),
          llm_model: a.llm_model,
          color: a.color
        });
        setSaved(true);
      } else if (data.defaults) {
        setForm(data.defaults);
        setSaved(false);
      }
    } catch {
      setError("Error de red al cargar el agente");
    }
    setLoading(false);
  }, [templateId]);

  useEffect(() => { loadAgent(); }, [loadAgent]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/voice/agents", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...form, template_id: templateId, color: meta.color })
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

  const sesionUrl = `/dashboard/agentes-voz/sesion?template=${templateId}${agentId ? `&agent=${agentId}` : ""}`;

  const tabs: { id: TabId; label: string; icon: React.ElementType; href?: string }[] = [
    { id: "contexto", label: "Contexto", icon: FileText },
    { id: "probar", label: "Probar agente", icon: Phone, href: sesionUrl },
    { id: "config", label: "Configuración", icon: Settings2 },
    { id: "analisis", label: "Análisis de llamadas", icon: BarChart3 },
    { id: "registro", label: "Registro de llamadas", icon: History },
    { id: "metrica", label: "Métrica", icon: LayoutGrid },
    { id: "canales", label: "Canales", icon: Radio }
  ];

  const setNum = (key: keyof VoiceAgentFormData, val: number) =>
    setForm(f => ({ ...f, [key]: val }));

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
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60 shrink-0"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/[.08] px-6 flex gap-1 overflow-x-auto shrink-0">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const disabled = !["config", "probar", "contexto"].includes(tab.id);

          if (tab.href && tab.id === "probar") {
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className="flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap text-gray-500 hover:text-white border-b-2 border-transparent hover:border-white/20"
              >
                <Icon className="w-3.5 h-3.5" /> {tab.label}
              </Link>
            );
          }

          return (
            <button
              key={tab.id}
              disabled={disabled}
              onClick={() => !disabled && setActiveTab(tab.id)}
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

              <SliderField label="Velocidad de voz" value={form.voice_speed} min={0.5} max={1.5} step={0.05}
                onChange={v => setNum("voice_speed", v)} />
              <SliderField label="Temperatura" value={form.temperature} min={0} max={2} step={0.1}
                onChange={v => setNum("temperature", v)} />
              <SliderField label="Volumen" value={form.volume} min={0} max={2} step={0.1}
                onChange={v => setNum("volume", v)} />

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

      {/* Contexto tab */}
      {activeTab === "contexto" && (
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-2xl space-y-4">
            <h2 className="text-base font-semibold">Contexto del agente</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Este agente se basa en la plantilla <strong className="text-white">{meta.name}</strong>.
              Personaliza el prompt en la pestaña Configuración. Cada usuario tiene su propia copia editable.
            </p>
            <div className="p-4 rounded-xl bg-white/[.03] border border-white/[.08] text-sm text-gray-300 whitespace-pre-wrap font-mono">
              {form.prompt.slice(0, 600)}{form.prompt.length > 600 ? "..." : ""}
            </div>
          </div>
        </div>
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
  label, value, min, max, step, onChange
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-violet-500"
        />
        <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{value.toFixed(2)}</span>
      </div>
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
