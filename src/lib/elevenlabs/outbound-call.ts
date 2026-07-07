import { elevenLabsFetch } from "@/lib/elevenlabs/client";
import { isVoicemailUtterance } from "@/lib/voice-voicemail-detection";
import { CAMPAIGN_ELEVENLABS_OUTBOUND_TOOLS } from "@/lib/elevenlabs/campaign-outbound-prompt";
import { getElevenLabsPhoneNumberId } from "@/lib/elevenlabs/config";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";
import { buildOutboundPhoneFirstMessage } from "@/lib/elevenlabs/default-voices";
import { buildPremiumTurnOverride } from "@/lib/elevenlabs/voice-platform-prompt";

export interface ElevenLabsOutboundCallResult {
  conversationId: string;
  sipCallId?: string;
}

export async function placeElevenLabsOutboundCall(input: {
  agentId: string;
  toE164: string;
  agentPhoneNumberId?: string | null;
  systemPromptOverride?: string;
  /** Campaña saliente: herramientas de buzón + end_call. */
  campaignOutbound?: boolean;
  /** Saludo al conectar. Si se omite, se arma con agentName + companyName (recomendado). */
  firstMessage?: string;
  agentName?: string;
  companyName?: string;
  /** Solo para pruebas: esperar "aló" (no usar en producción — falla con ruido de fondo). */
  waitForPickup?: boolean;
}): Promise<ElevenLabsOutboundCallResult> {
  const phoneNumberId =
    input.agentPhoneNumberId?.trim() || getElevenLabsPhoneNumberId();
  if (!phoneNumberId) {
    throw new Error(
      "Sin línea premium sincronizada — asigna una línea Telnyx al agente en Canales"
    );
  }

  const firstMessage = input.waitForPickup
    ? ""
    : (
        input.firstMessage?.trim()
        || buildOutboundPhoneFirstMessage(
          input.agentName ?? "",
          input.companyName ?? ""
        )
      );

  const data = await elevenLabsFetch<{
    conversation_id?: string;
    sip_call_id?: string;
  }>("/convai/sip-trunk/outbound-call", {
    method: "POST",
    json: {
      agent_id: input.agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: input.toE164,
      telephony_call_config: { ringing_timeout_secs: 60 },
      conversation_initiation_client_data: {
        dynamic_variables: buildColombiaTemporalContext().dynamicVariables,
        conversation_config_override: {
          agent: {
            first_message: firstMessage,
            disable_first_message_interruptions: true,
            ...(input.systemPromptOverride
              ? {
                  prompt: {
                    prompt: input.systemPromptOverride,
                    ...(input.campaignOutbound
                      ? { tools: CAMPAIGN_ELEVENLABS_OUTBOUND_TOOLS }
                      : {}),
                  },
                }
              : {}),
          },
          turn: buildPremiumTurnOverride(),
        },
      },
    },
  });

  const conversationId = data.conversation_id?.trim();
  if (!conversationId) {
    throw new Error("ElevenLabs no devolvió conversation_id");
  }

  return { conversationId, sipCallId: data.sip_call_id };
}

export interface ElevenLabsConversationDetail {
  status: string;
  callDurationSecs: number;
  transcript: { role: "user" | "agent"; text: string; time_sec: number }[];
  terminationReason?: string;
  errorCode?: number;
  errorReason?: string;
  voicemailDetected: boolean;
}

function detectVoicemailInConversation(data: Record<string, unknown>): boolean {
  const transcript = data.transcript;
  if (Array.isArray(transcript)) {
    for (const item of transcript) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const toolName = String(row.tool_name ?? row.tool ?? "").toLowerCase();
      if (toolName.includes("voicemail")) return true;

      const toolCalls = row.tool_calls ?? row.tool_results;
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          const name = String((tc as Record<string, unknown>)?.tool_name ?? (tc as Record<string, unknown>)?.name ?? "").toLowerCase();
          if (name.includes("voicemail")) return true;
        }
      }

      const message = String(row.message ?? row.text ?? "").trim();
      if (row.role === "agent" && message.toLowerCase().includes("voicemail_detection")) return true;
      if (row.role === "user" && message && isVoicemailUtterance(message)) return true;
    }
  }

  const analysis = data.analysis as Record<string, unknown> | undefined;
  const summary = String(analysis?.transcript_summary ?? "").trim();
  if (summary && isVoicemailUtterance(summary)) return true;
  const evalResults = analysis?.evaluation_criteria_results ?? analysis?.evaluations;
  if (Array.isArray(evalResults)) {
    for (const ev of evalResults) {
      const id = String((ev as Record<string, unknown>)?.criteria_id ?? "").toLowerCase();
      if (id.includes("voicemail")) return true;
    }
  }

  const metadata = data.metadata as Record<string, unknown> | undefined;
  const features = metadata?.features_usage as Record<string, unknown> | undefined;
  if (features?.voicemail_detection) {
    const vm = features.voicemail_detection as Record<string, unknown>;
    if (vm.enabled === true && (vm.used === true || vm.count)) return true;
  }

  return false;
}

export async function getElevenLabsConversation(
  conversationId: string
): Promise<ElevenLabsConversationDetail> {
  const data = await elevenLabsFetch<{
    status?: string;
    transcript?: { role?: string; message?: string; time_in_call_secs?: number }[];
    metadata?: {
      call_duration_secs?: number;
      error?: { code?: number; reason?: string };
      termination_reason?: string;
    };
    analysis?: { transcript_summary?: string };
  }>(`/convai/conversations/${encodeURIComponent(conversationId)}`);

  const transcript = (data.transcript ?? [])
    .filter(t => t.message?.trim())
    .map(t => ({
      role: t.role === "user" ? ("user" as const) : ("agent" as const),
      text: String(t.message ?? "").trim(),
      time_sec: Number(t.time_in_call_secs) || 0,
    }));

  const errorReason = data.metadata?.error?.reason?.trim();
  const terminationReason =
    errorReason
    || data.metadata?.termination_reason?.trim()
    || data.analysis?.transcript_summary;

  return {
    status: String(data.status ?? "initiated"),
    callDurationSecs: Number(data.metadata?.call_duration_secs) || 0,
    transcript,
    terminationReason,
    errorCode: data.metadata?.error?.code,
    errorReason,
    voicemailDetected: detectVoicemailInConversation(data as Record<string, unknown>),
  };
}

export function mapElevenLabsStatusToPhase(status: string): "dialing" | "ringing" | "connected" | "ended" | "failed" {
  switch (status) {
    case "initiated":
      return "dialing";
    case "in-progress":
      return "connected";
    case "processing":
    case "done":
      return "ended";
    case "failed":
      return "failed";
    default:
      return "ringing";
  }
}
