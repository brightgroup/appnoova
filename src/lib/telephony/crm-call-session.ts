import { adminClient } from "@/lib/voice-agents-server";
import type { PhoneTestCallMeta, PhoneTestCallPhase } from "@/lib/telephony/test-call-session";

export interface CrmOutboundCallMeta extends Omit<PhoneTestCallMeta, "phone_test" | "test_number_id"> {
  crm_outbound: true;
  crm_contact_id: string;
  phone_test?: false;
}

export async function createCrmOutboundCallSession(input: {
  userId: string;
  voiceAgentId: string;
  callControlId: string;
  phoneNumberId: string;
  crmContactId: string;
  from: string;
  to: string;
  agentName: string;
  contactName: string;
}): Promise<string> {
  const db = adminClient();
  const metadata: CrmOutboundCallMeta = {
    crm_outbound: true,
    crm_contact_id: input.crmContactId,
    call_control_id: input.callControlId,
    phase: "dialing",
    from: input.from,
    to: input.to,
    phone_number_id: input.phoneNumberId,
    agent_name: input.agentName,
    last_event: "call.dialing"
  };

  const { data, error } = await db
    .from("voice_agent_calls")
    .insert({
      user_id: input.userId,
      voice_agent_id: input.voiceAgentId,
      phone_number: input.to,
      status: "in_progress",
      status_label: crmLabelForPhase("dialing"),
      summary: `Llamada IA a ${input.contactName} (${input.to}).`,
      metadata: { ...metadata, crm_contact_id: input.crmContactId }
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo registrar la llamada");
  return data.id as string;
}

export function crmLabelForPhase(phase: PhoneTestCallPhase): string {
  switch (phase) {
    case "dialing": return "Llamada IA — Marcando";
    case "ringing": return "Llamada IA — Sonando";
    case "answered": return "Llamada IA — Contestada";
    case "speaking": return "Llamada IA — Agente hablando";
    case "connected": return "Llamada IA — En llamada";
    case "ended": return "Llamada IA — Finalizada";
    case "failed": return "Llamada IA — Error";
    default: return "Llamada IA";
  }
}

export async function resolveCrmOutboundFromState(
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
  crmContactId: string;
} | null> {
  const voiceAgentId = String(state.voice_agent_id ?? "");
  const phoneNumberId = String(state.phone_number_id ?? "");
  const crmContactId = String(state.crm_contact_id ?? "");
  const userId = String(state.user_id ?? "");
  const destinationE164 = String(state.destination_e164 ?? "");
  if (!voiceAgentId || !phoneNumberId || !crmContactId || !userId || !destinationE164) return null;

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
      .maybeSingle()
  ]);

  if (!phone || !agent) return null;

  const telnyx = (phone.voice_config as { telnyx?: { connection_id?: string; call_control_app_id?: string } })?.telnyx;
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
    crmContactId
  };
}
