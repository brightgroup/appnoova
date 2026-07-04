import { adminClient } from "@/lib/voice-agents-server";
import type { PhoneTestCallPhase } from "@/lib/telephony/test-call-session";

export interface CampaignOutboundCallMeta {
  campaign_outbound: true;
  call_control_id: string;
  campaign_id: string;
  campaign_audience_row_id: string;
  phase: PhoneTestCallPhase;
  from: string;
  to: string;
  phone_number_id: string;
  agent_name?: string;
  voice_provider?: "google" | "elevenlabs";
  conversation_id?: string;
  prompt_override?: string;
  last_event?: string;
  error?: string;
  answered_at?: string;
  ended_at?: string;
  finalized?: boolean;
  amd_pending?: boolean;
  amd_result?: string;
  voicemail_detected?: boolean;
  outcome?: string;
  agent_skipped?: boolean;
  /** Premium: ElevenLabs se conecta solo tras AMD humano en Telnyx. */
  el_deferred_amd?: boolean;
  el_connected?: boolean;
  screening_call_id?: string;
}

export async function createCampaignOutboundCallSession(input: {
  userId: string;
  voiceAgentId: string;
  callControlId: string;
  phoneNumberId: string;
  campaignId: string;
  campaignAudienceRowId: string;
  from: string;
  to: string;
  agentName: string;
  contactName: string;
  campaignName: string;
  voiceProvider?: "google" | "elevenlabs";
  promptOverride?: string;
  elDeferredAmd?: boolean;
}): Promise<string> {
  const db = adminClient();
  const isPremium = input.voiceProvider === "elevenlabs";
  const metadata: CampaignOutboundCallMeta = {
    campaign_outbound: true,
    call_control_id: input.callControlId,
    campaign_id: input.campaignId,
    campaign_audience_row_id: input.campaignAudienceRowId,
    phase: "dialing",
    from: input.from,
    to: input.to,
    phone_number_id: input.phoneNumberId,
    agent_name: input.agentName,
    voice_provider: isPremium ? "elevenlabs" : "google",
    prompt_override: input.promptOverride,
    ...(input.elDeferredAmd ? { el_deferred_amd: true } : {}),
    ...(isPremium && !input.elDeferredAmd ? { conversation_id: input.callControlId } : {}),
    last_event: isPremium
      ? input.elDeferredAmd
        ? "telnyx.amd_screening"
        : "elevenlabs.dialing"
      : "call.dialing",
  };

  const { data, error } = await db
    .from("voice_agent_calls")
    .insert({
      user_id: input.userId,
      voice_agent_id: input.voiceAgentId,
      campaign_id: input.campaignId,
      campaign_audience_row_id: input.campaignAudienceRowId,
      phone_number: input.to,
      status: "in_progress",
      status_label: campaignLabelForPhase("dialing"),
      summary: `Campaña «${input.campaignName}» — llamada a ${input.contactName} (${input.to}).`,
      metadata,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo registrar la llamada de campaña");
  return data.id as string;
}

export async function bindCampaignCallControlId(
  callId: string,
  callControlId: string,
  metaPatch?: Record<string, unknown>
): Promise<void> {
  const db = adminClient();
  const { data: row, error: fetchErr } = await db
    .from("voice_agent_calls")
    .select("metadata")
    .eq("id", callId)
    .maybeSingle();

  if (fetchErr || !row) {
    throw new Error(fetchErr?.message ?? "Sesión de llamada no encontrada");
  }

  const prev = (row.metadata ?? {}) as Record<string, unknown>;
  const isPremium = prev.voice_provider === "elevenlabs";

  const { error } = await db
    .from("voice_agent_calls")
    .update({
      metadata: {
        ...prev,
        ...metaPatch,
        call_control_id: callControlId,
        ...(isPremium ? { conversation_id: callControlId } : {}),
        last_event: isPremium ? "elevenlabs.dialing" : "call.dialing",
      },
    })
    .eq("id", callId);

  if (error) throw new Error(error.message);
}

export async function cancelReservedCampaignCall(callId: string): Promise<void> {
  const db = adminClient();
  await db.from("voice_agent_calls").delete().eq("id", callId);
}

export function campaignLabelForPhase(phase: PhoneTestCallPhase): string {
  switch (phase) {
    case "dialing":
      return "Campaña — Marcando";
    case "ringing":
      return "Campaña — Sonando";
    case "answered":
      return "Campaña — Contestada";
    case "speaking":
      return "Campaña — Agente hablando";
    case "connected":
      return "Campaña — En llamada";
    case "ended":
      return "Campaña — Finalizada";
    case "failed":
      return "Campaña — Error";
    default:
      return "Campaña";
  }
}

export async function resolveCampaignOutboundFromState(
  state: Record<string, unknown>
): Promise<{
  phone: {
    id: string;
    user_id: string;
    voice_agent_id: string;
    e164: string;
    provider: string;
    voice_config: Record<string, unknown>;
  };
  agent: { id: string; name: string; prompt: string };
  connectionId: string | null;
  destinationE164: string;
  campaignId: string;
  campaignAudienceRowId: string;
} | null> {
  const voiceAgentId = String(state.voice_agent_id ?? "");
  const phoneNumberId = String(state.phone_number_id ?? "");
  const campaignId = String(state.campaign_id ?? "");
  const campaignAudienceRowId = String(state.campaign_audience_row_id ?? "");
  const userId = String(state.user_id ?? "");
  const destinationE164 = String(state.destination_e164 ?? "");
  if (!voiceAgentId || !phoneNumberId || !campaignId || !campaignAudienceRowId || !userId || !destinationE164) {
    return null;
  }

  const db = adminClient();
  const [{ data: phone }, { data: agent }] = await Promise.all([
    db
      .from("phone_numbers")
      .select("id, user_id, voice_agent_id, e164, provider, voice_config")
      .eq("id", phoneNumberId)
      .eq("user_id", userId)
      .eq("voice_agent_id", voiceAgentId)
      .eq("status", "active")
      .maybeSingle(),
    db
      .from("voice_agents")
      .select("id, name, prompt")
      .eq("id", voiceAgentId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!phone || !agent) return null;

  const telnyx = (phone.voice_config as { telnyx?: { connection_id?: string; call_control_app_id?: string } })
    ?.telnyx;
  const connectionId =
    telnyx?.connection_id ||
    telnyx?.call_control_app_id ||
    process.env.TELNYX_CONNECTION_ID?.trim() ||
    null;

  return {
    phone: phone as {
      id: string;
      user_id: string;
      voice_agent_id: string;
      e164: string;
      provider: string;
      voice_config: Record<string, unknown>;
    },
    agent,
    connectionId,
    destinationE164,
    campaignId,
    campaignAudienceRowId,
  };
}
