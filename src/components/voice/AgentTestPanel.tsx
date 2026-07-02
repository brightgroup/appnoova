"use client";

import { useState } from "react";
import { Globe, Phone } from "lucide-react";
import { btnFilterActive, btnFilterGroup, btnFilterIdle } from "@/lib/brand-ui";
import { PhoneTestPanel } from "@/components/telephony/PhoneTestPanel";
import { VoiceSessionPanel, type VoiceSessionPanelProps } from "@/components/voice/VoiceSessionPanel";
import { PremiumVoiceSessionPanel } from "@/components/voice/PremiumVoiceSessionPanel";

type TestMode = "web" | "phone";

interface AgentTestPanelProps extends VoiceSessionPanelProps {
  agentName: string;
}

export function AgentTestPanel({ agentName, agentConfig, ...voiceProps }: AgentTestPanelProps) {
  const [mode, setMode] = useState<TestMode>("web");
  const isPremium = agentConfig.voice_provider === "elevenlabs";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="px-6 py-3 border-b border-white/[.08] shrink-0 agent-test-tabs">
        <div className={btnFilterGroup}>
          <button
            onClick={() => setMode("web")}
            className={`flex items-center gap-1.5 ${mode === "web" ? btnFilterActive : btnFilterIdle}`}
          >
            <Globe className="w-3.5 h-3.5" /> Probar con web
          </button>
          <button
            onClick={() => setMode("phone")}
            className={`flex items-center gap-1.5 ${mode === "phone" ? btnFilterActive : btnFilterIdle}`}
          >
            <Phone className="w-3.5 h-3.5" /> Probar con teléfono
          </button>
        </div>
      </div>

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
