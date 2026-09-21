"use client";

import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { Cpu, Globe, Phone } from "lucide-react";
import { AgentPromptButton, AgentSidebarField, AgentSidebarSlider } from "@/components/agents/AgentSidebarField";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { VoiceOrb } from "@/components/agents/VoiceOrb";
import { InfoBox } from "@/components/ui/InfoBox";
import { GEMINI_VOICES, VOICE_MODELS } from "@/lib/voice-agent-options";
import { DEFAULT_ELEVENLABS_VOICE_ID, ELEVENLABS_DEFAULT_VOICES } from "@/lib/elevenlabs/default-voices";
import { llmModelIcon } from "@/lib/llm/provider-icon";
import type { VoiceAgentFormData } from "@/types/voice-agent";
import type { CompanyContext } from "@/types/company-context";
import type { VoiceTestMode } from "@/components/voice/AgentTestPanel";

/** Configuración del agente de voz junto al panel de llamada. Mientras hay una
 *  llamada en curso todo sigue editándose, pero el guardado espera a que
 *  cuelgue: cambiar el agente a media conversación reconfiguraría la sesión.
 *  El modelo no está aquí: vive junto al estado de la llamada, igual que en
 *  los agentes de texto vive en el composer. */
export function VoiceConfigSidebar({
  form,
  setForm,
  contexts,
  elevenlabsVoices,
  isPremium,
  callActive,
  testMode,
  onChangeTestMode,
  onEditPrompt
}: {
  form: VoiceAgentFormData;
  setForm: Dispatch<SetStateAction<VoiceAgentFormData>>;
  contexts: CompanyContext[];
  elevenlabsVoices: { id: string; label: string }[];
  isPremium: boolean;
  callActive: boolean;
  testMode: VoiceTestMode;
  onChangeTestMode: (mode: VoiceTestMode) => void;
  onEditPrompt: () => void;
}) {
  const assignedContext = contexts.find(c => c.id === form.company_context_id);
  const contextLength = assignedContext?.content?.trim().length ?? 0;
  const premiumVoices = elevenlabsVoices.length ? elevenlabsVoices : ELEVENLABS_DEFAULT_VOICES;

  return (
    <div className="px-5 pb-8">
      {callActive && (
        <div className="mt-4 rounded-xl border border-[#0f7eff]/25 bg-[#0f7eff]/[.08] px-3 py-2.5">
          <p className="text-[11.5px] leading-relaxed text-[var(--nv-text-muted)]">
            Llamada en curso. Puedes seguir ajustando, pero los cambios se guardan al colgar y se
            aplican en la próxima llamada.
          </p>
        </div>
      )}

      <AgentSidebarField
        label="Probar con"
        hint={callActive ? "Cuelga antes de cambiar de canal." : undefined}
      >
        <div className="inline-flex w-full gap-0.5 rounded-lg bg-[var(--nv-bg-control)] p-0.5">
          {([
            { id: "web", label: "Web", icon: Globe },
            { id: "phone", label: "Teléfono", icon: Phone }
          ] as const).map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeTestMode(opt.id)}
                disabled={callActive && testMode !== opt.id}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  testMode === opt.id
                    ? "bg-[var(--nv-bg-surface)] text-[var(--nv-text)]"
                    : "text-[var(--nv-text-faint)] hover:text-[var(--nv-text)]"
                }`}
              >
                <Icon className="h-3 w-3" /> {opt.label}
              </button>
            );
          })}
        </div>
      </AgentSidebarField>

      <AgentPromptButton onClick={onEditPrompt} hint="Rol, objetivo y tono del agente en la llamada." />

      <AgentSidebarField label="Nombre del agente">
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="w-full rounded-lg border border-[var(--nv-input-border)] bg-[var(--nv-bg-control)] px-3 py-2 text-sm text-[var(--nv-text)] focus:border-[#0f7eff]/50 focus:outline-none"
        />
      </AgentSidebarField>

      <AgentSidebarField label="Marca / contexto">
        <NoovaSelect
          value={form.company_context_id ?? ""}
          onChange={v => setForm(f => ({ ...f, company_context_id: v || null }))}
          allowEmpty={true}
          emptyLabel="Sin marca (solo prompt del agente)"
          options={contexts.map(c => ({
            value: c.id,
            label: `${c.name}${c.is_default ? " · predeterminada" : ""}`
          }))}
        />
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--nv-text-faint)]">
          {assignedContext
            ? `${assignedContext.name} (${contextLength.toLocaleString()} caracteres) — se añade al final de cada llamada.`
            : "Asigna una marca para inyectar productos, servicios y políticas al final de cada llamada."}
        </p>
        <Link
          href="/dashboard/contextos"
          className="mt-2 inline-block text-[11px] text-[#0f7eff] hover:text-[#99c9ff]"
        >
          Gestionar contextos de marca →
        </Link>
      </AgentSidebarField>

      {isPremium ? (
        <AgentSidebarField label="Voz premium">
          <NoovaSelect
            value={form.elevenlabs_voice_id ?? DEFAULT_ELEVENLABS_VOICE_ID}
            onChange={v => setForm(f => ({ ...f, elevenlabs_voice_id: v }))}
            allowEmpty={false}
            options={premiumVoices.map(v => ({
              value: v.id,
              label: v.label,
              icon: <VoiceOrb seed={v.id} />
            }))}
          />
        </AgentSidebarField>
      ) : (
        <>
          <AgentSidebarField label="Voz">
            <NoovaSelect
              value={form.voice_name}
              onChange={v => setForm(f => ({ ...f, voice_name: v }))}
              allowEmpty={false}
              options={GEMINI_VOICES.map(v => ({
                value: v.id,
                label: v.label,
                icon: <VoiceOrb seed={v.id} />
              }))}
            />
          </AgentSidebarField>

          <AgentSidebarField label="Modelo de voz">
            <NoovaSelect
              value={form.model}
              onChange={v => setForm(f => ({ ...f, model: v }))}
              allowEmpty={false}
              options={VOICE_MODELS.map(m => ({ value: m.id, label: m.label, icon: llmModelIcon(m.id) }))}
            />
          </AgentSidebarField>

          <AgentSidebarSlider
            label="Velocidad de voz"
            hint="Reproducción del audio en la prueba (0.5 lento · 1.5 rápido)"
            value={form.voice_speed}
            min={0.5}
            max={1.5}
            step={0.05}
            onChange={v => setForm(f => ({ ...f, voice_speed: v }))}
          />

          <AgentSidebarSlider
            label="Volumen"
            hint="Nivel de salida en tu navegador durante la sesión"
            value={form.volume}
            min={0}
            max={2}
            step={0.05}
            onChange={v => setForm(f => ({ ...f, volume: v }))}
          />
        </>
      )}

      <AgentSidebarSlider
        label="Temperatura"
        hint={isPremium ? "Creatividad del agente premium (0 = precisa · 2 = más libre)" : "Creatividad del agente (0 = precisa · 2 = más libre)"}
        value={form.temperature}
        min={0.1}
        max={2}
        step={0.1}
        onChange={v => setForm(f => ({ ...f, temperature: v }))}
      />

      <div className="pt-4">
        <InfoBox icon={Cpu} label="Motor" title={isPremium ? "Voz premium" : "Voz estándar"} variant="accent">
          El proveedor se elige al crear el agente.
        </InfoBox>
      </div>
    </div>
  );
}
