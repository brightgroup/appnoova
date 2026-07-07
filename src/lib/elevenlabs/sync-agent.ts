import { getPurposeMeta } from "@/lib/agent-purpose-catalog";
import { elevenLabsFetch } from "@/lib/elevenlabs/client";
import {
  buildElevenLabsAgentSystemPrompt,
  isOutboundVoicePurpose,
} from "@/lib/elevenlabs/agent-phone-prompt";
import {
  DEFAULT_ELEVENLABS_VOICE_ID,
  PREMIUM_END_CALL_TOOL,
  PREMIUM_VOICEMAIL_DETECTION_TOOL,
  buildPremiumFirstMessage,
} from "@/lib/elevenlabs/default-voices";
import { listCuratedPremiumVoices } from "@/lib/elevenlabs/premium-voices";
import { ELEVENLABS_DEFAULT_LLM, ELEVENLABS_TTS_MODEL_ID } from "@/lib/elevenlabs/config";

export interface ElevenLabsSyncInput {
  name: string;
  prompt: string;
  purposeId: string;
  elevenlabsVoiceId?: string | null;
  temperature?: number;
  existingAgentId?: string | null;
  companyName?: string;
  companyContextText?: string;
}

/** Permite anular first_message y prompt en cada llamada (SIP / web). */
function buildPlatformSettings() {
  return {
    overrides: {
      conversation_config_override: {
        agent: {
          first_message: true,
          prompt: { prompt: true },
        },
      },
    },
  };
}

function buildConversationConfig(input: ElevenLabsSyncInput, companyName: string) {
  const voiceId = input.elevenlabsVoiceId?.trim() || DEFAULT_ELEVENLABS_VOICE_ID;
  const temperature = Math.min(1.2, Math.max(0.3, Number(input.temperature) || 0.85));
  const outbound = isOutboundVoicePurpose(input.purposeId);
  const agentName = input.name.trim() || "su asesor";
  const systemPrompt = buildElevenLabsAgentSystemPrompt({
    prompt: input.prompt,
    purposeId: input.purposeId,
    agentName,
    companyName,
    companyContextText: input.companyContextText,
  });

  const outboundTools = outbound
    ? [PREMIUM_VOICEMAIL_DETECTION_TOOL, PREMIUM_END_CALL_TOOL]
    : [PREMIUM_END_CALL_TOOL];

  const turn = outbound
    ? {
        turn_timeout: 15,
        turn_eagerness: "eager" as const,
        mode: "turn" as const,
        speculative_turn: true,
        turn_model: "turn_v3" as const,
        transcribe_on_disabled_interruptions: true,
        interruption_ignore_terms: [
          "aló",
          "alo",
          "bueno",
          "eh",
          "pues",
          "mm",
          "mhm",
          "este",
          "o sea",
        ],
        soft_timeout_config: {
          timeout_seconds: 5,
          message: "Un momentico, ya le confirmo.",
          use_llm_generated_message: false,
        },
      }
    : {
        turn_timeout: 7,
        turn_eagerness: "normal" as const,
        mode: "turn" as const,
        speculative_turn: true,
        turn_model: "turn_v3" as const,
        transcribe_on_disabled_interruptions: true,
        soft_timeout_config: {
          timeout_seconds: 5,
          message: "Un momentico, ya le confirmo.",
          use_llm_generated_message: false,
        },
      };

  return {
    agent: {
      // Outbound telefónico: vacío → ElevenLabs espera el "aló" del cliente.
      first_message: outbound
        ? ""
        : buildPremiumFirstMessage(agentName, companyName),
      language: "es",
      // Evita que ruido o "aló" corten el saludo inicial.
      disable_first_message_interruptions: true,
      prompt: {
        prompt: systemPrompt,
        llm: ELEVENLABS_DEFAULT_LLM,
        temperature,
        tools: outboundTools,
      },
    },
    asr: {
      quality: "high",
    },
    turn,
    tts: {
      voice_id: voiceId,
      model_id: ELEVENLABS_TTS_MODEL_ID,
      optimize_streaming_latency: 3,
      stability: 0.72,
      similarity_boost: 0.78,
    },
    conversation: {
      max_duration_seconds: 600,
    },
  };
}

export async function syncElevenLabsAgent(
  input: ElevenLabsSyncInput & { companyName?: string }
): Promise<{ agentId: string; voiceId: string }> {
  const companyName = input.companyName?.trim() || "Mi empresa";
  const conversation_config = buildConversationConfig(input, companyName);
  const platform_settings = buildPlatformSettings();
  const voiceId = conversation_config.tts.voice_id;

  if (input.existingAgentId?.trim()) {
    await elevenLabsFetch(`/convai/agents/${input.existingAgentId.trim()}`, {
      method: "PATCH",
      json: {
        name: input.name.trim(),
        conversation_config,
        platform_settings,
      },
    });
    return { agentId: input.existingAgentId.trim(), voiceId };
  }

  const created = await elevenLabsFetch<{ agent_id: string }>("/convai/agents/create", {
    method: "POST",
    json: {
      name: input.name.trim(),
      conversation_config,
      platform_settings,
    },
  });

  if (!created.agent_id) {
    throw new Error("ElevenLabs no devolvió agent_id");
  }

  return { agentId: created.agent_id, voiceId };
}

export async function deleteElevenLabsAgent(agentId: string | null | undefined): Promise<void> {
  const id = agentId?.trim();
  if (!id) return;
  try {
    await elevenLabsFetch(`/convai/agents/${id}`, { method: "DELETE" });
  } catch (err) {
    console.warn("[elevenlabs] delete agent:", err);
  }
}

export async function listElevenLabsVoices(): Promise<{ id: string; label: string }[]> {
  const voices = await listCuratedPremiumVoices();
  return voices.map(v => ({ id: v.id, label: v.label }));
}
