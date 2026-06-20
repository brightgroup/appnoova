"use client";

import { useState } from "react";
import { Globe, Phone, Sparkles } from "lucide-react";
import { btnFilterActive, btnFilterGroup, btnFilterIdle } from "@/lib/brand-ui";
import { PhoneTestPanel } from "@/components/telephony/PhoneTestPanel";
import { VoiceSessionPanel, type VoiceSessionPanelProps } from "@/components/voice/VoiceSessionPanel";

type TestMode = "web" | "phone";

interface AgentTestPanelProps extends VoiceSessionPanelProps {
  agentName: string;
}

export function AgentTestPanel({ agentName, agentConfig, ...voiceProps }: AgentTestPanelProps) {
  const [mode, setMode] = useState<TestMode>("web");
  const isPremium = agentConfig.voice_provider === "elevenlabs";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="px-6 py-3 border-b border-white/[.08] shrink-0">
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
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div className="max-w-md">
              <Sparkles className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-white">Prueba web no disponible en premium</p>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                Los agentes premium se prueban por teléfono. Usa la pestaña &quot;Probar con teléfono&quot;.
              </p>
            </div>
          </div>
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
