import { elevenLabsFetch } from "@/lib/elevenlabs/client";
import { ELEVENLABS_TEMPORAL_PROMPT_BLOCK } from "@/lib/colombia-calendar";
import {
  DEFAULT_ELEVENLABS_VOICE_ID,
  PREMIUM_CALL_ENDING_PROMPT,
  PREMIUM_END_CALL_TOOL,
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
}

function buildFirstMessage(agentName: string, companyName: string): string {
  return `Buenas tardes, le saluda ${agentName} de ${companyName}. ¿Con quién tengo el gusto?`;
}

function buildConversationConfig(input: ElevenLabsSyncInput, companyName: string) {
  const voiceId = input.elevenlabsVoiceId?.trim() || DEFAULT_ELEVENLABS_VOICE_ID;
  const temperature = Math.min(1.2, Math.max(0.3, Number(input.temperature) || 0.85));

  return {
    agent: {
      first_message: buildFirstMessage(input.name.trim() || "su asesor", companyName),
      language: "es",
      // Igual que el widget EL: no interrumpir el saludo inicial por ruido ambiente.
      disable_first_message_interruptions: true,
      prompt: {
        prompt: `${ELEVENLABS_TEMPORAL_PROMPT_BLOCK}\n\n${input.prompt.trim()}${PREMIUM_CALL_ENDING_PROMPT}`,
        llm: ELEVENLABS_DEFAULT_LLM,
        temperature,
        tools: [PREMIUM_END_CALL_TOOL],
      },
    },
    asr: {
      quality: "high",
    },
    turn: {
      turn_timeout: 7,
      turn_eagerness: "patient",
      mode: "turn",
      speculative_turn: false,
    },
    tts: {
      voice_id: voiceId,
      model_id: ELEVENLABS_TTS_MODEL_ID,
      optimize_streaming_latency: 0,
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
  const voiceId = conversation_config.tts.voice_id;

  if (input.existingAgentId?.trim()) {
    await elevenLabsFetch(`/convai/agents/${input.existingAgentId.trim()}`, {
      method: "PATCH",
      json: {
        name: input.name.trim(),
        conversation_config,
      },
    });
    return { agentId: input.existingAgentId.trim(), voiceId };
  }

  const created = await elevenLabsFetch<{ agent_id: string }>("/convai/agents/create", {
    method: "POST",
    json: {
      name: input.name.trim(),
      conversation_config,
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
