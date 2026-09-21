"use client";

import { PhoneTestPanel } from "@/components/telephony/PhoneTestPanel";
import { VoiceSessionPanel, type VoiceSessionPanelProps } from "@/components/voice/VoiceSessionPanel";
import { PremiumVoiceSessionPanel } from "@/components/voice/PremiumVoiceSessionPanel";

export type VoiceTestMode = "web" | "phone";

interface AgentTestPanelProps extends VoiceSessionPanelProps {
  agentName: string;
  /** Controlado desde la configuración: el selector vive en el panel lateral
   *  para no gastar un renglón entero de la pantalla de prueba. */
  mode?: VoiceTestMode;
}

export function AgentTestPanel({ agentName, agentConfig, mode = "web", ...voiceProps }: AgentTestPanelProps) {
  const isPremium = agentConfig.voice_provider === "elevenlabs";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {mode === "web" ? (
        isPremium ? (
          <PremiumVoiceSessionPanel agentConfig={agentConfig} {...voiceProps} />
        ) : (
          <VoiceSessionPanel agentConfig={agentConfig} {...voiceProps} />
        )
      ) : (
        <PhoneTestPanel
          agentId={voiceProps.agentId ?? null}
          agentName={agentName}
          voiceProvider={agentConfig.voice_provider}
          onCallDetected={voiceProps.onCallSaved}
        />
      )}
    </div>
  );
}
