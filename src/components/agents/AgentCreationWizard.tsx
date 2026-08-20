"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X, Loader2, ChevronRight, ChevronLeft, Check, Building2, Mic, MessageSquare,
} from "lucide-react";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import { TEXT_AGENT_PURPOSES, VOICE_AGENT_PURPOSES, type AgentChannel } from "@/lib/agent-purpose-catalog";
import { generateAgentPrompt } from "@/lib/agent-prompt-generator";
import { buildDefaultVoiceBusinessPrompt } from "@/lib/elevenlabs/voice-business-prompt";
import { getPurposeMeta } from "@/lib/agent-purpose-catalog";
import { getPurposeIcon } from "@/lib/agent-purpose-icons";
import { GEMINI_VOICES } from "@/lib/voice-agent-options";
import {
  suggestVoiceForAgentName,
  voiceLabel,
} from "@/lib/voice-name-inference";
import {
  suggestTemperatureForPurpose,
  suggestVoiceForPurpose,
} from "@/lib/voice-accent-profile";
import { DEFAULT_ELEVENLABS_VOICE_ID } from "@/lib/elevenlabs/default-voices";
import { usePricingCatalog } from "@/hooks/usePricingCatalog";
import { VOICE_CREDITS_PER_MINUTE, VOICE_PREMIUM_CREDITS_PER_MINUTE } from "@/lib/billing/pricing";
import type { CompanyContext } from "@/types/company-context";
import type { VoiceProvider } from "@/types/voice-agent";

type WizardStep = "agent" | "company";

interface AgentCreationWizardProps {
  channel: AgentChannel;
  open: boolean;
  onClose: () => void;
  onCreated: (agentId: string) => void;
  getAuthHeaders: () => Promise<HeadersInit>;
  apiPath: "/api/text/agents" | "/api/voice/agents";
}

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "agent", label: "Agente" },
  { id: "company", label: "Empresa" },
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
  const isVoice = channel === "voice";
  const [step, setStep] = useState<WizardStep>("agent");
  const [purposeId, setPurposeId] = useState(purposes[0].id);
  const [agentName, setAgentName] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const [contextMode, setContextMode] = useState<"existing" | "new">("existing");
  const [contexts, setContexts] = useState<CompanyContext[]>([]);
  const [selectedContextId, setSelectedContextId] = useState<string>("");
  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [loadingContexts, setLoadingContexts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [voiceName, setVoiceName] = useState(() =>
    isVoice ? suggestVoiceForPurpose(purposes[0].id) : "Puck"
  );
  const [voiceManual, setVoiceManual] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>("google");
  const [elevenlabsVoiceId, setElevenlabsVoiceId] = useState(DEFAULT_ELEVENLABS_VOICE_ID);
  const [elevenlabsVoices, setElevenlabsVoices] = useState<{ id: string; label: string }[]>([]);
  const [loadingElVoices, setLoadingElVoices] = useState(false);
  const { catalog: pricingCatalog } = usePricingCatalog();
  const voiceStdCredits = pricingCatalog?.voice_standard_per_min ?? VOICE_CREDITS_PER_MINUTE;
  const voicePremCredits = pricingCatalog?.voice_premium_per_min ?? VOICE_PREMIUM_CREDITS_PER_MINUTE;

  const reset = useCallback(() => {
    setStep("agent");
    setPurposeId(purposes[0].id);
    setAgentName("");
    setExtraInstructions("");
    setShowExtra(false);
    setContextMode("existing");
    setSelectedContextId("");
    setCompanyName("");
    setCompanyDescription("");
    setError("");
    setVoiceName(isVoice ? suggestVoiceForPurpose(purposes[0].id) : "Puck");
    setVoiceManual(false);
    setVoiceProvider("google");
    setElevenlabsVoiceId(DEFAULT_ELEVENLABS_VOICE_ID);
  }, [purposes, isVoice]);

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
    if (!open || !isVoice || voiceProvider !== "elevenlabs") return;
    let cancelled = false;
    (async () => {
      setLoadingElVoices(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/voice/elevenlabs/voices", { headers });
        const data = await res.json();
        if (!cancelled && res.ok && data.voices?.length) {
          setElevenlabsVoices(data.voices);
          setElevenlabsVoiceId(prev =>
            data.voices.some((v: { id: string }) => v.id === prev) ? prev : data.voices[0].id
          );
        }
      } catch {
        /* fallback en select */
      } finally {
        if (!cancelled) setLoadingElVoices(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, isVoice, voiceProvider, getAuthHeaders]);

  useEffect(() => {
    if (!isVoice || voiceManual) return;
    setVoiceName(suggestVoiceForPurpose(purposeId));
  }, [isVoice, purposeId, voiceManual]);

  useEffect(() => {
    if (!isVoice || voiceManual) return;
    const trimmed = agentName.trim();
    if (trimmed.length >= 2) {
      setVoiceName(suggestVoiceForAgentName(trimmed));
    }
  }, [isVoice, agentName, voiceManual]);

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

  const generatedPrompt = useMemo(
    () =>
      isVoice
        ? buildDefaultVoiceBusinessPrompt({
            purposeId,
            agentName: resolvedAgentName,
            companyName: resolvedCompanyName,
            extraInstructions,
          })
        : generateAgentPrompt({
            channel,
            agentName: resolvedAgentName,
            purposeId,
            companyName: resolvedCompanyName,
            companyDescription: companyDescription.trim(),
            extraInstructions,
          }),
    [isVoice, channel, resolvedAgentName, purposeId, resolvedCompanyName, companyDescription, extraInstructions]
  );

  const purposeMeta = getPurposeMeta(channel, purposeId);
  const stepIndex = STEPS.findIndex(s => s.id === step);

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

  const handleCreate = async (): Promise<string | null> => {
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
          ...(isVoice
            ? {
                voice_provider: voiceProvider,
                voice_name: voiceName,
                elevenlabs_voice_id: voiceProvider === "elevenlabs" ? elevenlabsVoiceId : null,
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

  if (!open) return null;

  const ChannelIcon = isVoice ? Mic : MessageSquare;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl p-4">
      <div className="relative bg-noova-surface border border-white/[.10] rounded-3xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#0f7eff]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative px-6 pt-6 pb-3 shrink-0 border-b border-white/[.06]">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-5 right-5 p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06]"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-[#0f7eff]/15 border border-[#0f7eff]/25 flex items-center justify-center">
              <ChannelIcon className="w-4 h-4 text-[#99c9ff]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isVoice ? "Nuevo agente de voz" : "Nuevo agente de texto"}
              </h2>
              <p className="text-[11px] text-gray-500">Paso {stepIndex + 1} de {STEPS.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    i < stepIndex
                      ? "bg-[#0f7eff] text-white"
                      : i === stepIndex
                        ? "bg-[#0f7eff]/20 text-[#99c9ff] ring-2 ring-[#0f7eff]"
                        : "bg-white/[.06] text-gray-500"
                  }`}
                >
                  {i < stepIndex ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span
                  className={`text-[11px] truncate hidden sm:block ${
                    i === stepIndex ? "text-[#99c9ff] font-medium" : "text-gray-500"
                  }`}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px ${i < stepIndex ? "bg-[#0f7eff]/40" : "bg-white/[.08]"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="relative flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {step === "agent" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Plantilla</label>
                <div className="grid grid-cols-2 gap-2">
                  {purposes.map(p => {
                    const Icon = getPurposeIcon(channel, p.id);
                    const selected = purposeId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPurposeId(p.id);
                          if (isVoice && !voiceManual) {
                            setVoiceName(suggestVoiceForPurpose(p.id));
                          }
                        }}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                          selected
                            ? "border-[#0f7eff]/50 bg-[#0f7eff]/10 ring-1 ring-[#0f7eff]/30"
                            : "border-white/[.08] bg-white/[.02] hover:border-white/[.16]"
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          selected ? "bg-[#0f7eff]/20" : "bg-white/[.04]"
                        }`}>
                          <Icon className={`w-4 h-4 ${selected ? "text-[#99c9ff]" : "text-gray-400"}`} />
                        </div>
                        <span className="text-xs font-semibold text-white leading-tight">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {isVoice && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Motor de voz</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setVoiceProvider("google")}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        voiceProvider === "google"
                          ? "border-[#0f7eff]/50 bg-[#0f7eff]/10 ring-1 ring-[#0f7eff]/30"
                          : "border-white/[.08] bg-white/[.02] hover:border-white/[.16]"
                      }`}
                    >
                      <p className="text-xs font-semibold text-white">Estándar</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{voiceStdCredits} cr/min</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceProvider("elevenlabs")}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        voiceProvider === "elevenlabs"
                          ? "border-[var(--nv-hubspot-teal)]/50 bg-[var(--nv-hubspot-teal-soft)] ring-1 ring-[var(--nv-hubspot-teal)]/30"
                          : "border-white/[.08] bg-white/[.02] hover:border-white/[.16]"
                      }`}
                    >
                      <p className="text-xs font-semibold text-white">Premium</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{voicePremCredits} cr/min</p>
                    </button>
                  </div>
                </div>
              )}

              <div className={`grid gap-3 ${isVoice ? "sm:grid-cols-2" : ""}`}>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Nombre del agente *</label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    placeholder={isVoice ? "Ej. Manuela, Juan" : "Ej. Valentina, Asistente"}
                    className="w-full bg-noova-main border border-white/[.12] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#0f7eff]/50"
                  />
                </div>
                {isVoice ? (
                  voiceProvider === "elevenlabs" ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Voz premium</label>
                      <select
                        value={elevenlabsVoiceId}
                        onChange={e => setElevenlabsVoiceId(e.target.value)}
                        disabled={loadingElVoices}
                        className="w-full bg-noova-main border border-white/[.12] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--nv-accent)]/50 disabled:opacity-60"
                      >
                        {(elevenlabsVoices.length ? elevenlabsVoices : [{ id: DEFAULT_ELEVENLABS_VOICE_ID, label: "Voz predeterminada" }]).map(v => (
                          <option key={v.id} value={v.id} className="bg-[#232329]">{v.label}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-600 mt-1">Prueba solo por teléfono</p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Voz</label>
                      <select
                        value={voiceName}
                        onChange={e => {
                          setVoiceManual(true);
                          setVoiceName(e.target.value);
                        }}
                        className="w-full bg-noova-main border border-white/[.12] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0f7eff]/50"
                      >
                        {GEMINI_VOICES.map(v => (
                          <option key={v.id} value={v.id} className="bg-[#232329]">{v.label}</option>
                        ))}
                      </select>
                      {agentName.trim().length >= 2 && (
                        <p className="text-[10px] text-gray-600 mt-1">{voiceLabel(voiceName)}</p>
                      )}
                    </div>
                  )
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setShowExtra(v => !v)}
                className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showExtra ? "− Ocultar instrucciones extra" : "+ Instrucciones extra (opcional)"}
              </button>
              {showExtra && (
                <textarea
                  value={extraInstructions}
                  onChange={e => setExtraInstructions(e.target.value)}
                  rows={2}
                  placeholder="Ej. Captura email y motivo de contacto."
                  className="w-full bg-noova-main border border-white/[.12] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#0f7eff]/50 resize-none"
                />
              )}
            </div>
          )}

          {step === "company" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                {purposeMeta.label} · <span className="text-gray-400">{resolvedAgentName}</span>
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={contexts.length === 0}
                  onClick={() => setContextMode("existing")}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    contextMode === "existing"
                      ? "border-[#0f7eff]/40 bg-[#0f7eff]/10 text-[#99c9ff]"
                      : "border-white/[.08] text-gray-400 hover:text-white disabled:opacity-40"
                  }`}
                >
                  Contexto existente
                </button>
                <button
                  type="button"
                  onClick={() => setContextMode("new")}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    contextMode === "new"
                      ? "border-[#0f7eff]/40 bg-[#0f7eff]/10 text-[#99c9ff]"
                      : "border-white/[.08] text-gray-400 hover:text-white"
                  }`}
                >
                  Crear nuevo
                </button>
              </div>

              {loadingContexts ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
                </div>
              ) : contextMode === "existing" ? (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Empresa *</label>
                  <select
                    value={selectedContextId}
                    onChange={e => setSelectedContextId(e.target.value)}
                    className="w-full bg-noova-main border border-white/[.12] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0f7eff]/50"
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
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Nombre *</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="Ej. Noova 360"
                      className="w-full bg-noova-main border border-white/[.12] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#0f7eff]/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Descripción *</label>
                    <textarea
                      value={companyDescription}
                      onChange={e => setCompanyDescription(e.target.value)}
                      rows={4}
                      placeholder="Productos, servicios y propuesta de valor."
                      className="w-full bg-noova-main border border-white/[.12] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#0f7eff]/50 resize-none"
                    />
                    <p className="text-[10px] text-gray-600 mt-1">Mínimo 20 caracteres.</p>
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative px-6 py-4 border-t border-white/[.06] flex items-center justify-between shrink-0 bg-noova-surface">
          {step === "agent" ? (
            <button type="button" onClick={handleClose} className={btnGhost}>
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep("agent")}
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
              onClick={() => void handleCreate()}
              className={`${btnPrimary} gap-1.5 disabled:opacity-40`}
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
      </div>
    </div>
  );
}
