"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X, Loader2, Sparkles, ChevronRight, ChevronLeft, Check, Building2, Phone,
} from "lucide-react";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import { TEXT_AGENT_PURPOSES, VOICE_AGENT_PURPOSES, type AgentChannel } from "@/lib/agent-purpose-catalog";
import { generateAgentPrompt, type AgentLanguage } from "@/lib/agent-prompt-generator";
import { getPurposeMeta } from "@/lib/agent-purpose-catalog";
import { GEMINI_VOICES, DEFAULT_LIVE_MODEL } from "@/lib/voice-agent-options";
import {
  suggestVoiceForAgentName,
  voiceGenderHint,
  voiceLabel,
} from "@/lib/voice-name-inference";
import {
  suggestTemperatureForPurpose,
  suggestVoiceForPurpose,
  getVoiceAccentProfile,
} from "@/lib/voice-accent-profile";
import { AgentTestPanel } from "@/components/voice/AgentTestPanel";
import type { VoiceAgentFormData } from "@/types/voice-agent";
import type { CompanyContext } from "@/types/company-context";

type WizardStep = "agent" | "company" | "preview" | "test";

interface AgentCreationWizardProps {
  channel: AgentChannel;
  open: boolean;
  onClose: () => void;
  onCreated: (agentId: string) => void;
  getAuthHeaders: () => Promise<HeadersInit>;
  apiPath: "/api/text/agents" | "/api/voice/agents";
}

const TEXT_STEPS: { id: WizardStep; label: string }[] = [
  { id: "agent", label: "Contexto del agente" },
  { id: "company", label: "Contexto de empresa" },
  { id: "preview", label: "Probar agente" },
];

const VOICE_STEPS: { id: WizardStep; label: string }[] = [
  { id: "agent", label: "Agente y voz" },
  { id: "company", label: "Empresa" },
  { id: "test", label: "Probar" },
];

const LANGUAGE_OPTIONS: { value: AgentLanguage; label: string }[] = [
  { value: "es", label: "Español — Colombia" },
  { value: "en", label: "English" },
  { value: "multi", label: "Multi-idioma" },
];

export function AgentCreationWizard({
  channel,
  open,
  onClose,
  onCreated,
  getAuthHeaders,
  apiPath,
}: AgentCreationWizardProps) {
  const purposes = channel === "text" ? TEXT_AGENT_PURPOSES : VOICE_AGENT_PURPOSES;
  const steps = channel === "voice" ? VOICE_STEPS : TEXT_STEPS;
  const [step, setStep] = useState<WizardStep>("agent");
  const [purposeId, setPurposeId] = useState(purposes[0].id);
  const [agentName, setAgentName] = useState("");
  const [language, setLanguage] = useState<AgentLanguage>(channel === "voice" ? "es" : "multi");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [contextMode, setContextMode] = useState<"existing" | "new">("existing");
  const [contexts, setContexts] = useState<CompanyContext[]>([]);
  const [selectedContextId, setSelectedContextId] = useState<string>("");
  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [loadingContexts, setLoadingContexts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [voiceName, setVoiceName] = useState(() =>
    channel === "voice" ? suggestVoiceForPurpose(purposes[0].id) : "Puck"
  );
  const [voiceManual, setVoiceManual] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("agent");
    setPurposeId(purposes[0].id);
    setAgentName("");
    setLanguage(channel === "voice" ? "es" : "multi");
    setExtraInstructions("");
    setContextMode("existing");
    setSelectedContextId("");
    setCompanyName("");
    setCompanyDescription("");
    setError("");
    setVoiceName(channel === "voice" ? suggestVoiceForPurpose(purposes[0].id) : "Puck");
    setVoiceManual(false);
    setCreatedAgentId(null);
  }, [purposes, channel]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const loadContexts = useCallback(async () => {
    setLoadingContexts(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/company-contexts", { headers });
      const data = await res.json();
      const list = (data.contexts ?? []) as CompanyContext[];
      setContexts(list);
      if (list.length) {
        const def = list.find(c => c.is_default) ?? list[0];
        setSelectedContextId(def.id);
        setCompanyName(def.name);
        setCompanyDescription(def.content);
        setContextMode("existing");
      } else {
        setContextMode("new");
        setCompanyName("");
        setCompanyDescription("");
      }
    } catch {
      setContexts([]);
      setContextMode("new");
    } finally {
      setLoadingContexts(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!open) return;
    void loadContexts();
  }, [open, loadContexts]);

  useEffect(() => {
    if (channel !== "voice") return;
    if (!voiceManual) {
      setVoiceName(suggestVoiceForPurpose(purposeId));
    }
  }, [channel, purposeId, voiceManual]);

  useEffect(() => {
    if (channel !== "voice" || voiceManual) return;
    const trimmed = agentName.trim();
    if (trimmed.length >= 2) {
      setVoiceName(suggestVoiceForAgentName(trimmed));
    }
  }, [channel, agentName, voiceManual]);

  useEffect(() => {
    if (contextMode !== "existing" || !selectedContextId) return;
    const ctx = contexts.find(c => c.id === selectedContextId);
    if (ctx) {
      setCompanyName(ctx.name);
      setCompanyDescription(ctx.content);
    }
  }, [contextMode, selectedContextId, contexts]);

  const resolvedCompanyName = companyName.trim() || "Mi empresa";
  const resolvedAgentName = agentName.trim() || "Asistente";
  const accentProfile = getVoiceAccentProfile(purposeId);

  const generatedPrompt = useMemo(
    () =>
      generateAgentPrompt({
        channel,
        agentName: resolvedAgentName,
        purposeId,
        companyName: resolvedCompanyName,
        companyDescription: companyDescription.trim(),
        language,
        extraInstructions,
      }),
    [channel, resolvedAgentName, purposeId, resolvedCompanyName, companyDescription, language, extraInstructions]
  );

  const draftVoiceConfig = useMemo((): VoiceAgentFormData => ({
    source_template: purposeId,
    name: resolvedAgentName,
    prompt: generatedPrompt,
    company_context_id: selectedContextId || null,
    voice_name: voiceName,
    model: DEFAULT_LIVE_MODEL,
    voice_speed: 1.0,
    temperature: suggestTemperatureForPurpose(purposeId),
    volume: 1.0,
    llm_model: DEFAULT_LIVE_MODEL,
    color: getPurposeMeta(channel, purposeId).color,
  }), [purposeId, resolvedAgentName, generatedPrompt, selectedContextId, voiceName, channel]);

  const purposeMeta = getPurposeMeta(channel, purposeId);
  const channelLabel = channel === "text" ? "Texto" : "Voz";
  const stepIndex = steps.findIndex(s => s.id === step);

  const canContinueAgent = agentName.trim().length >= 2;
  const canContinueCompany =
    contextMode === "existing"
      ? Boolean(selectedContextId)
      : companyName.trim().length >= 2 && companyDescription.trim().length >= 20;

  const ensureContextId = async (): Promise<string | null> => {
    if (contextMode === "existing" && selectedContextId) return selectedContextId;

    const headers = await getAuthHeaders();
    const res = await fetch("/api/company-contexts", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: companyName.trim(),
        content: companyDescription.trim(),
        website_url: "",
        is_default: contexts.length === 0,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.context?.id) {
      throw new Error(data.error || "No se pudo guardar el contexto de empresa");
    }
    return data.context.id as string;
  };

  const handleCreate = async (goToTest = false): Promise<string | null> => {
    setSaving(true);
    setError("");
    try {
      const contextId = await ensureContextId();
      const headers = await getAuthHeaders();
      const purpose = getPurposeMeta(channel, purposeId);
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          source_template: purposeId,
          name: resolvedAgentName,
          prompt: generatedPrompt,
          company_context_id: contextId,
          color: purpose.color,
          ...(channel === "voice"
            ? {
                voice_name: voiceName,
                temperature: suggestTemperatureForPurpose(purposeId),
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.agent?.id) {
        throw new Error(data.error || "No se pudo crear el agente");
      }
      const id = data.agent.id as string;
      setCreatedAgentId(id);

      if (channel === "voice" && goToTest) {
        setStep("test");
        return id;
      }

      handleClose();
      onCreated(id);
      return id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el agente");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const finishVoiceWizard = () => {
    const id = createdAgentId;
    handleClose();
    if (id) onCreated(id);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl p-4">
      <div
        className={`relative bg-noova-surface border border-white/[.10] rounded-3xl w-full flex flex-col shadow-2xl overflow-hidden ${
          step === "test" && channel === "voice" ? "max-w-4xl max-h-[92vh]" : "max-w-3xl max-h-[90vh]"
        }`}
      >
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#5b5bf6]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative px-8 pt-8 pb-4 shrink-0 border-b border-white/[.06]">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-6 right-6 p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06]"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#5b5bf6]/10 border border-[#5b5bf6]/20">
              <Sparkles className="w-3 h-3 text-[#5b5bf6]" />
              <span className="text-xs font-medium text-[#5b5bf6]">IA de {channelLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-2">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i < stepIndex
                      ? "bg-[#5b5bf6] text-white"
                      : i === stepIndex
                        ? "bg-[#5b5bf6]/20 text-[#a5a5ff] ring-2 ring-[#5b5bf6]"
                        : "bg-white/[.06] text-gray-500"
                  }`}
                >
                  {i < stepIndex ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span
                  className={`text-xs truncate hidden sm:block ${
                    i === stepIndex ? "text-[#a5a5ff] font-medium" : "text-gray-500"
                  }`}
                >
                  {s.label}
                </span>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-px ${i < stepIndex ? "bg-[#5b5bf6]/40" : "bg-white/[.08]"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className={`relative flex-1 min-h-0 ${step === "test" && channel === "voice" ? "flex flex-col overflow-hidden" : "overflow-y-auto px-8 py-6"}`}>
          {step === "agent" && (
            <div className="space-y-6 px-8 py-6">
              <div>
                <h2 className="text-xl font-bold text-white">Elige plantilla y voz</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {channel === "voice"
                    ? "Selecciona el propósito, el nombre y la voz para tu primera prueba."
                    : "Selecciona una plantilla general y personaliza los datos básicos."}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {purposes.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPurposeId(p.id);
                      if (channel === "voice" && !voiceManual) {
                        setVoiceName(suggestVoiceForPurpose(p.id));
                      }
                    }}
                    className={`text-left p-4 rounded-2xl border transition-all ${
                      purposeId === p.id
                        ? "border-[#5b5bf6]/50 bg-[#5b5bf6]/10 ring-1 ring-[#5b5bf6]/30"
                        : "border-white/[.08] bg-white/[.02] hover:border-white/[.16] hover:bg-white/[.04]"
                    }`}
                  >
                    <span className="text-lg mb-2 block">{p.emoji}</span>
                    <div className="text-sm font-semibold text-white leading-snug">{p.label}</div>
                    <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">{p.description}</div>
                  </button>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Nombre del agente *</label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    placeholder={channel === "voice" ? "Ej. Manuela, Juan, Valentina" : "Ej. Juan, Valentina, Asistente web"}
                    className="w-full bg-noova-main border border-white/[.12] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#5b5bf6]/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Idioma *</label>
                  <select
                    value={language}
                    onChange={e => setLanguage(e.target.value as AgentLanguage)}
                    className="w-full bg-noova-main border border-white/[.12] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50"
                  >
                    {LANGUAGE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value} className="bg-[#232329]">{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {channel === "voice" && (
                <div className="rounded-2xl border border-[#5b5bf6]/20 bg-[#5b5bf6]/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-[#a5a5ff] uppercase tracking-wide">Voz para probar *</label>
                    <span className="text-[10px] text-gray-500">{accentProfile.label}</span>
                  </div>
                  <select
                    value={voiceName}
                    onChange={e => {
                      setVoiceManual(true);
                      setVoiceName(e.target.value);
                    }}
                    className="w-full bg-[#232329] border border-white/[.12] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50"
                  >
                    {GEMINI_VOICES.map(v => (
                      <option key={v.id} value={v.id} className="bg-[#232329]">{v.label}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    {agentName.trim().length >= 2 ? voiceGenderHint(agentName) : "El acento paisa viene del prompt; el timbre lo eliges aquí."}
                    {!voiceManual && agentName.trim().length >= 2 && (
                      <span className="text-[#a5a5ff]"> Sugerida: {voiceLabel(voiceName)}.</span>
                    )}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Instrucciones importantes (opcional)</label>
                <textarea
                  value={extraInstructions}
                  onChange={e => setExtraInstructions(e.target.value)}
                  rows={3}
                  placeholder="Ej. Captura nombre, email y motivo de contacto."
                  className="w-full bg-noova-main border border-white/[.12] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#5b5bf6]/50 resize-none"
                />
              </div>
            </div>
          )}

          {step === "company" && (
            <div className="space-y-6 px-8 py-6">
              <div>
                <h2 className="text-xl font-bold text-white">Contexto de la empresa</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Con esto el agente conoce tu marca. El prompt completo lo ajustas después en configuración.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={contexts.length === 0}
                  onClick={() => setContextMode("existing")}
                  className={`px-4 py-2 rounded-xl text-sm border transition-colors ${
                    contextMode === "existing"
                      ? "border-[#5b5bf6]/40 bg-[#5b5bf6]/10 text-[#a5a5ff]"
                      : "border-white/[.08] text-gray-400 hover:text-white disabled:opacity-40"
                  }`}
                >
                  Usar contexto existente
                </button>
                <button
                  type="button"
                  onClick={() => setContextMode("new")}
                  className={`px-4 py-2 rounded-xl text-sm border transition-colors ${
                    contextMode === "new"
                      ? "border-[#5b5bf6]/40 bg-[#5b5bf6]/10 text-[#a5a5ff]"
                      : "border-white/[.08] text-gray-400 hover:text-white"
                  }`}
                >
                  Crear nuevo contexto
                </button>
              </div>

              {loadingContexts ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando contextos…
                </div>
              ) : contextMode === "existing" ? (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Empresa *</label>
                  <select
                    value={selectedContextId}
                    onChange={e => setSelectedContextId(e.target.value)}
                    className="w-full bg-noova-main border border-white/[.12] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50"
                  >
                    {contexts.map(c => (
                      <option key={c.id} value={c.id} className="bg-[#232329]">
                        {c.name}{c.is_default ? " (predeterminado)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Nombre de la empresa *</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="Ej. Noova 360, Mi Tienda Online"
                      className="w-full bg-noova-main border border-white/[.12] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#5b5bf6]/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Descripción de la empresa *</label>
                    <textarea
                      value={companyDescription}
                      onChange={e => setCompanyDescription(e.target.value)}
                      rows={6}
                      placeholder="Productos, servicios, tono de marca y propuesta de valor."
                      className="w-full bg-noova-main border border-white/[.12] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#5b5bf6]/50 resize-none"
                    />
                    <p className="text-[11px] text-gray-600 mt-1">Mínimo 20 caracteres.</p>
                  </div>
                </>
              )}
            </div>
          )}

          {step === "preview" && channel === "text" && (
            <div className="space-y-4 px-8 py-6">
              <div>
                <h2 className="text-xl font-bold text-white">Listo para crear</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Agente <strong className="text-gray-300">{resolvedAgentName}</strong> — {purposeMeta.label} para{" "}
                  <strong className="text-gray-300">{resolvedCompanyName}</strong>.
                </p>
              </div>
              <p className="text-xs text-gray-600">
                Podrás editar el prompt en la configuración del agente después de crearlo.
              </p>
            </div>
          )}

          {step === "test" && channel === "voice" && createdAgentId && (
            <div className="flex-1 flex flex-col min-h-[420px] overflow-hidden">
              <div className="px-6 py-3 border-b border-white/[.06] shrink-0">
                <h2 className="text-lg font-bold text-white">Prueba tu agente</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {resolvedAgentName} · {voiceLabel(voiceName)} · {purposeMeta.label}. Ajusta el prompt en configuración cuando quieras.
                </p>
              </div>
              <AgentTestPanel
                sourceTemplate={purposeId}
                agentId={createdAgentId}
                agentName={resolvedAgentName}
                agentConfig={draftVoiceConfig}
                companyContext={companyDescription.trim()}
                ready
              />
            </div>
          )}

          {error && (
            <div className="mx-8 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {!(step === "test" && channel === "voice") && (
          <div className="relative px-8 py-5 border-t border-white/[.06] flex items-center justify-between shrink-0 bg-noova-surface">
            {step === "agent" ? (
              <button type="button" onClick={handleClose} className={btnGhost}>
                Cancelar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(step === "preview" || step === "test" ? "company" : "agent")}
                className={`${btnGhost} gap-1.5`}
                disabled={saving}
              >
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
            )}

            {step === "agent" && (
              <button
                type="button"
                disabled={!canContinueAgent}
                onClick={() => setStep("company")}
                className={`${btnPrimary} gap-1.5 disabled:opacity-40`}
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {step === "company" && (
              <button
                type="button"
                disabled={!canContinueCompany || loadingContexts || saving}
                onClick={() => {
                  if (channel === "voice") void handleCreate(true);
                  else setStep("preview");
                }}
                className={`${btnPrimary} gap-1.5 disabled:opacity-40`}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Preparando…
                  </>
                ) : channel === "voice" ? (
                  <>
                    <Phone className="w-4 h-4" /> Probar agente
                  </>
                ) : (
                  <>
                    Continuar <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}

            {step === "preview" && channel === "text" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleCreate(false)}
                className={`${btnPrimary} gap-2 disabled:opacity-60`}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Creando…
                  </>
                ) : (
                  <>
                    <Building2 className="w-4 h-4" /> Crear agente
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {step === "test" && channel === "voice" && (
          <div className="relative px-8 py-4 border-t border-white/[.06] flex items-center justify-end shrink-0 bg-noova-surface">
            <button type="button" onClick={finishVoiceWizard} className={btnPrimary}>
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
