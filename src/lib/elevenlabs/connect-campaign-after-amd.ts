import { buildElevenLabsAgentSystemPrompt } from "@/lib/elevenlabs/agent-phone-prompt";
import {
  CAMPAIGN_POST_AMD_CONTEXT,
} from "@/lib/elevenlabs/campaign-outbound-prompt";
import { buildOutboundCampaignFirstMessage } from "@/lib/elevenlabs/default-voices";
import { placeElevenLabsOutboundCall } from "@/lib/elevenlabs/outbound-call";
import { resolveElevenLabsPhoneLine } from "@/lib/elevenlabs/phone-line";
import { resolvePlatformSipConfig } from "@/lib/elevenlabs/sip-config";
import { telnyxHangup } from "@/lib/telephony/telnyx-call-control";
import type { LoadedVoiceAgent } from "@/lib/telephony/load-voice-agent";
import type { PhoneTestCallSessionRow } from "@/lib/telephony/test-call-session";
import { adminClient } from "@/lib/voice-agents-server";

/**
 * Tras AMD humano en campaña premium: cuelga la pierna Telnyx de verificación
 * y conecta ElevenLabs (el buzón nunca llega al agente IA).
 */
export async function connectCampaignElevenLabsAfterAmd(input: {
  screeningCallControlId: string;
  session: PhoneTestCallSessionRow;
  agent: LoadedVoiceAgent;
  phoneNumberId: string;
  elevenlabsAgentId: string;
}): Promise<void> {
  const meta = input.session.metadata as unknown as Record<string, unknown>;
  if (meta.el_connected || meta.conversation_id) return;

  const promptOverride = String(meta.prompt_override ?? "").trim();
  if (!promptOverride) {
    console.warn("[campaign-el-amd] sin prompt_override", input.screeningCallControlId);
    return;
  }

  await resolvePlatformSipConfig();

  const db = adminClient();
  const { data: phone } = await db
    .from("phone_numbers")
    .select(
      "id, e164, friendly_name, voice_agent_id, elevenlabs_phone_number_id, elevenlabs_sync_error, elevenlabs_synced_at"
    )
    .eq("id", input.phoneNumberId)
    .maybeSingle();

  if (!phone) throw new Error("Línea no encontrada");

  const line = await resolveElevenLabsPhoneLine(phone, {
    elevenlabsAgentId: input.elevenlabsAgentId,
    resync: true,
  });
  if (!line.configured || !line.phoneNumberId) {
    throw new Error(line.syncError ?? "Línea premium no configurada");
  }

  const destination = String(meta.to ?? "").trim();
  if (!destination) throw new Error("Destino no definido");

  const systemPromptOverride = buildElevenLabsAgentSystemPrompt({
    prompt: promptOverride + CAMPAIGN_POST_AMD_CONTEXT,
    purposeId: input.agent.config.source_template,
    agentName: input.agent.agentName,
    companyName: input.agent.companyName,
    companyContextText: input.agent.companyContextText,
  });

  const firstMessage = buildOutboundCampaignFirstMessage(
    input.agent.agentName,
    input.agent.companyName
  );

  const { conversationId } = await placeElevenLabsOutboundCall({
    agentId: input.elevenlabsAgentId,
    toE164: destination,
    agentPhoneNumberId: line.phoneNumberId,
    systemPromptOverride,
    campaignOutbound: true,
    firstMessage,
  });

  const now = new Date().toISOString();
  await db
    .from("voice_agent_calls")
    .update({
      status_label: "Campaña — Conectando agente premium",
      metadata: {
        ...meta,
        campaign_outbound: true,
        screening_call_id: input.screeningCallControlId,
        conversation_id: conversationId,
        el_deferred_amd: false,
        el_connected: true,
        amd_pending: false,
        phase: "dialing",
        last_event: "elevenlabs.post_amd_connect",
        voice_provider: "elevenlabs",
      },
      updated_at: now,
    })
    .eq("id", input.session.id);

  try {
    await telnyxHangup(input.screeningCallControlId);
  } catch (e) {
    console.warn("[campaign-el-amd] hangup screening:", e);
  }

  console.info("[campaign-el-amd] conectado", {
    screening: input.screeningCallControlId,
    conversationId,
    to: destination,
  });
}
