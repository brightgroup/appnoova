"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Save, Loader2, CheckCircle2, Settings2,
  BarChart3, History, Radio, LayoutGrid, RefreshCw
} from "lucide-react";
import { btnPrimary, tabActive, tabIdle } from "@/lib/brand-ui";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import { getTemplateMeta } from "@/lib/voice-agent-templates";
import { normalizeVoiceAgentForm } from "@/lib/voice-agent-audio";
import { GEMINI_VOICES, VOICE_MODELS, LLM_MODELS } from "@/lib/voice-agent-options";
import { DEFAULT_ELEVENLABS_VOICE_ID, ELEVENLABS_DEFAULT_VOICES } from "@/lib/elevenlabs/default-voices";
import { ELEVENLABS_LLM_MODELS, ELEVENLABS_RECOMMENDED_LLM, isElevenLabsLlm } from "@/lib/elevenlabs/llm-models";
import { VOICE_AGENT_PROMPT_GUIDE, buildDefaultVoiceBusinessPrompt } from "@/lib/elevenlabs/voice-business-prompt";
import { VOICE_CREDITS_PER_MINUTE, VOICE_PREMIUM_CREDITS_PER_MINUTE } from "@/lib/billing/pricing";
import { usePricingCatalog } from "@/hooks/usePricingCatalog";
import type { VoiceAgentFormData, VoiceAgentRecord } from "@/types/voice-agent";
import type { CompanyContext } from "@/types/company-context";
import { AgentTestPanel, type VoiceTestMode } from "@/components/voice/AgentTestPanel";
import { VoiceConfigSidebar } from "@/components/voice/VoiceConfigSidebar";
import { CallRegistryPanel } from "@/components/voice/CallRegistryPanel";
import { AgentPhoneChannelPanel } from "@/components/telephony/AgentPhoneChannelPanel";
import { AgentPromptModal } from "@/components/agents/AgentPromptModal";
import { VoiceAgentIcon } from "@/components/icons/VoiceAgentIcon";
import { InfoBox } from "@/components/ui/InfoBox";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { llmModelIcon } from "@/lib/llm/provider-icon";

type TabId = "config" | "analisis" | "registro" | "metrica" | "canales";

/** "Probar agente" se fusionó dentro de "Configurar y probar": los enlaces
 *  viejos siguen llegando a donde esperaban. */
function parseTab(tab: string | null): TabId {
  if (tab === "probar") return "config";
  if (tab === "config" || tab === "registro" || tab === "canales") return tab;
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
  const [promptOpen, setPromptOpen] = useState(false);
  const [testMode, setTestMode] = useState<VoiceTestMode>("web");
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
  const { catalog: pricingCatalog } = usePricingCatalog();
  const voiceStdCredits = pricingCatalog?.voice_standard_per_min ?? VOICE_CREDITS_PER_MINUTE;
  const voicePremCredits = pricingCatalog?.voice_premium_per_min ?? VOICE_PREMIUM_CREDITS_PER_MINUTE;

  const isPremium = form.voice_provider === "elevenlabs";

  // Agentes premium usan modelos nativos de ElevenLabs. Si viene un modelo de
  // Google Live (agente antiguo) o vacío, normaliza al recomendado.
  useEffect(() => {
    if (isPremium && !isElevenLabsLlm(form.llm_model)) {
      setForm(f => ({ ...f, llm_model: ELEVENLABS_RECOMMENDED_LLM }));
    }
  }, [isPremium, form.llm_model]);

  const meta = getTemplateMeta(form.source_template);
  const assignedContext = contexts.find(c => c.id === form.company_context_id);
  const companyContextText = assignedContext?.content ?? "";
  const companyName = assignedContext?.name ?? "";

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

  // Memoizados a propósito: ahora la configuración vive al lado del panel de
  // llamada y se re-renderiza con cada tecla. Si estos callbacks cambiaran de
  // identidad, los efectos de la sesión de voz se reejecutarían sin parar.
  const handleCallStatusChange = useCallback((active: boolean, sec: number) => {
    setCallActive(active);
    setCallDuration(sec);
  }, []);

  const handleCallSaved = useCallback(() => {
    setRegistryRefresh(k => k + 1);
  }, []);

  const handleEndCall = useCallback(() => {
    setTab("registro");
  }, [setTab]);

  const restoreTemplate = () => {
    const empresa = companyName.trim() || "Mi empresa";
    if (
      !window.confirm(
        "¿Reemplazar el prompt con la plantilla predeterminada? Se perderán los cambios manuales en el texto del prompt."
      )
    ) {
      return;
    }
    setForm(f => ({
      ...f,
      prompt: buildDefaultVoiceBusinessPrompt({
        purposeId: f.source_template,
        agentName: f.name,
        companyName: empresa,
      }),
    }));
    setSaved(false);
  };

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "config", label: "Configurar y probar", icon: Settings2 },
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
          className="mt-4 px-4 py-2 rounded-lg bg-[#0f7eff] hover:bg-[#3392ff] text-white text-sm font-semibold"
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
          <div className="w-9 h-9 rounded-full bg-[#0f7eff]/10 flex items-center justify-center shrink-0">
            <VoiceAgentIcon className="w-[22px] h-[22px]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{form.name}</h1>
            <p className="text-xs text-gray-400">
              Plantilla: {meta.tag} · {meta.description}
              {isPremium ? ` · Premium (${voicePremCredits} cr/min)` : ` · Estándar (${voiceStdCredits} cr/min)`}
              {!saved && " · Sin guardar aún"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {callActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0f7eff]/[.08] border border-[#0f7eff]/25">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0f7eff] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0f7eff]" />
              </span>
              <span className="text-xs font-semibold text-[#0f7eff] tabular-nums">
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
          const disabled = !["config", "registro", "canales"].includes(tab.id);

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
          <div className="flex-1 min-w-0 flex flex-col">
            <AgentTestPanel
              sourceTemplate={form.source_template}
              agentId={agentId}
              agentName={form.name}
              agentConfig={form}
              companyContext={companyContextText}
              companyName={companyName}
              ready={!loading && !!agentId}
              mode={testMode}
              modelSelector={
                <NoovaSelect
                  value={
                    isPremium
                      ? (isElevenLabsLlm(form.llm_model) ? form.llm_model : ELEVENLABS_RECOMMENDED_LLM)
                      : form.llm_model
                  }
                  onChange={llm_model => setForm(f => ({ ...f, llm_model }))}
                  allowEmpty={false}
                  className="w-auto min-w-[130px]"
                  options={(isPremium ? ELEVENLABS_LLM_MODELS : LLM_MODELS).map(m => ({
                    value: m.id,
                    label: m.label,
                    icon: llmModelIcon(m.id)
                  }))}
                />
              }
              onEndCall={handleEndCall}
              onCallSaved={handleCallSaved}
              onCallStatusChange={handleCallStatusChange}
            />
          </div>

          <aside className="w-[300px] shrink-0 border-l border-[var(--nv-border)] overflow-y-auto">
            <VoiceConfigSidebar
              form={form}
              setForm={setForm}
              contexts={contexts}
              elevenlabsVoices={elevenlabsVoices}
              isPremium={isPremium}
              callActive={callActive}
              testMode={testMode}
              onChangeTestMode={setTestMode}
              onEditPrompt={() => setPromptOpen(true)}
            />
          </aside>
        </div>
      )}

      {/* Registro de llamadas */}
      {activeTab === "registro" && agentId && (
        <CallRegistryPanel agentId={agentId} refreshKey={registryRefresh} />
      )}

      {activeTab === "canales" && agentId && (
        <AgentPhoneChannelPanel agentId={agentId} isPremium={isPremium} />
      )}


      <AgentPromptModal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        subtitle={`${form.name || "Agente de voz"} · ${meta.tag}`}
        value={form.prompt}
        onChange={prompt => setForm(f => ({ ...f, prompt }))}
        editorMode={editorMode}
        onChangeEditorMode={setEditorMode}
        guide={
          <InfoBox layout="row" variant="accent">
            {VOICE_AGENT_PROMPT_GUIDE}
          </InfoBox>
        }
        headerAction={
          <button
            type="button"
            onClick={restoreTemplate}
            disabled={callActive}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[#0f7eff]/30 bg-[#0f7eff]/15 px-2.5 py-1.5 text-[11px] font-medium text-[var(--nv-text)] hover:bg-[#0f7eff]/25 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Restaurar plantilla
          </button>
        }
      />
    </div>
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
