import { elevenLabsFetch } from "@/lib/elevenlabs/client";
import { getElevenLabsPhoneNumberId } from "@/lib/elevenlabs/config";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";

export interface ElevenLabsOutboundCallResult {
  conversationId: string;
  sipCallId?: string;
}

export async function placeElevenLabsOutboundCall(input: {
  agentId: string;
  toE164: string;
}): Promise<ElevenLabsOutboundCallResult> {
  const phoneNumberId = getElevenLabsPhoneNumberId();
  if (!phoneNumberId) {
    throw new Error("ELEVENLABS_PHONE_NUMBER_ID no configurado en el servidor");
  }

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
}

export async function getElevenLabsConversation(
  conversationId: string
): Promise<ElevenLabsConversationDetail> {
  const data = await elevenLabsFetch<{
    status?: string;
    transcript?: { role?: string; message?: string; time_in_call_secs?: number }[];
    metadata?: { call_duration_secs?: number };
    analysis?: { transcript_summary?: string };
  }>(`/convai/conversations/${encodeURIComponent(conversationId)}`);

  const transcript = (data.transcript ?? [])
    .filter(t => t.message?.trim())
    .map(t => ({
      role: t.role === "user" ? ("user" as const) : ("agent" as const),
      text: String(t.message ?? "").trim(),
      time_sec: Number(t.time_in_call_secs) || 0,
    }));

  return {
    status: String(data.status ?? "initiated"),
    callDurationSecs: Number(data.metadata?.call_duration_secs) || 0,
    transcript,
    terminationReason: data.analysis?.transcript_summary,
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
