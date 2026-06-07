import { adminClient } from "@/lib/voice-agents-server";
import { e164Matches, toE164 } from "@/lib/telephony/e164";

export interface AgentCallContext {
  phone: {
    id: string;
    user_id: string;
    voice_agent_id: string;
    e164: string;
    provider: string;
    voice_config: Record<string, unknown>;
  };
  agent: {
    id: string;
    name: string;
    prompt: string;
  };
  connectionId: string | null;
}

export interface OutboundTestContext extends AgentCallContext {
  destinationE164: string;
  isTestDestination: boolean;
}

export async function resolveAgentLine(fromRaw: string): Promise<AgentCallContext | null> {
  const e164 = toE164(fromRaw);
  if (!e164) return null;

  const db = adminClient();
  const { data: phone } = await db
    .from("phone_numbers")
    .select("id, user_id, voice_agent_id, e164, provider, voice_config")
    .eq("e164", e164)
    .eq("status", "active")
    .maybeSingle();

  if (!phone?.voice_agent_id) return null;

  const { data: agent } = await db
    .from("voice_agents")
    .select("id, name, prompt")
    .eq("id", phone.voice_agent_id)
    .maybeSingle();

  if (!agent) return null;

  const telnyx = (phone.voice_config as { telnyx?: { connection_id?: string; call_control_app_id?: string } })?.telnyx;
  const connectionId =
    telnyx?.connection_id ||
    telnyx?.call_control_app_id ||
    process.env.TELNYX_CONNECTION_ID?.trim() ||
    null;

  return {
    phone: phone as AgentCallContext["phone"],
    agent,
    connectionId
  };
}

export async function resolveOutboundTest(
  fromRaw: string,
  toRaw: string
): Promise<OutboundTestContext | null> {
  const ctx = await resolveAgentLine(fromRaw);
  if (!ctx) return null;

  const destinationE164 = toE164(toRaw);
  if (!destinationE164) return null;

  const db = adminClient();
  const { data: testNumbers } = await db
    .from("test_phone_numbers")
    .select("e164")
    .eq("user_id", ctx.phone.user_id);

  const isTestDestination = (testNumbers ?? []).some(t => e164Matches(t.e164, destinationE164));
  if (!isTestDestination) return null;

  return { ...ctx, destinationE164, isTestDestination };
}

export function agentGreeting(agentName: string, prompt: string): string {
  const firstLine = prompt
    .split("\n")
    .map(l => l.replace(/^#+\s*/, "").trim())
    .find(l => l.length > 8);
  if (firstLine && firstLine.length < 200) {
    return `Hola, soy ${agentName}. ${firstLine}`;
  }
  return `Hola, soy ${agentName}, tu asistente de Noova. ¿En qué puedo ayudarte hoy?`;
}

export async function logPhoneTestCall(
  ctx: AgentCallContext,
  opts: {
    direction: "inbound" | "outbound";
    counterpartyE164: string;
    isTest: boolean;
    meta?: Record<string, unknown>;
  }
) {
  const db = adminClient();
  const label =
    opts.direction === "outbound"
      ? "Prueba telefónica - Llamada saliente"
      : opts.isTest
        ? "Prueba telefónica - Llamada entrante"
        : "Inbound - Llamada entrante";

  await db.from("voice_agent_calls").insert({
    user_id: ctx.phone.user_id,
    voice_agent_id: ctx.phone.voice_agent_id,
    phone_number: opts.counterpartyE164,
    status: opts.isTest ? "ended_success" : "missed",
    status_label: label,
    summary:
      opts.direction === "outbound"
        ? `Llamada de prueba del agente ${ctx.agent.name} desde ${ctx.phone.e164} a ${opts.counterpartyE164}.`
        : `Llamada entrante a ${ctx.phone.e164} desde ${opts.counterpartyE164}.`,
    metadata: {
      direction: opts.direction,
      is_test_call: opts.isTest,
      provider: ctx.phone.provider,
      from: ctx.phone.e164,
      to: opts.direction === "outbound" ? opts.counterpartyE164 : ctx.phone.e164,
      ...(opts.meta ?? {})
    }
  });
}
