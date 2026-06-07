import { adminClient } from "@/lib/voice-agents-server";
import { e164Matches, toE164 } from "@/lib/telephony/e164";

export interface InboundCallContext {
  phone: {
    id: string;
    user_id: string;
    voice_agent_id: string | null;
    e164: string;
    provider: string;
  };
  agent: {
    id: string;
    name: string;
    prompt: string;
  } | null;
  isTestCaller: boolean;
  callerE164: string;
}

export async function resolveInboundCall(
  toRaw: string,
  fromRaw: string
): Promise<InboundCallContext | null> {
  const e164 = toE164(toRaw);
  if (!e164) return null;

  const db = adminClient();
  const { data: phone } = await db
    .from("phone_numbers")
    .select("id, user_id, voice_agent_id, e164, provider")
    .eq("e164", e164)
    .eq("status", "active")
    .maybeSingle();

  if (!phone?.voice_agent_id) return null;

  const callerE164 = toE164(fromRaw) || fromRaw || "Desconocido";

  const [{ data: agent }, { data: testNumbers }] = await Promise.all([
    db
      .from("voice_agents")
      .select("id, name, prompt")
      .eq("id", phone.voice_agent_id)
      .maybeSingle(),
    db
      .from("test_phone_numbers")
      .select("e164")
      .eq("user_id", phone.user_id)
  ]);

  const isTestCaller = (testNumbers ?? []).some(t => e164Matches(t.e164, callerE164));

  return {
    phone,
    agent: agent ?? null,
    isTestCaller,
    callerE164
  };
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

export async function logInboundCall(
  ctx: InboundCallContext,
  meta: Record<string, unknown>
) {
  const db = adminClient();
  const label = ctx.isTestCaller
    ? "Prueba telefónica - Llamada entrante"
    : "Inbound - Llamada entrante";

  await db.from("voice_agent_calls").insert({
    user_id: ctx.phone.user_id,
    voice_agent_id: ctx.phone.voice_agent_id,
    phone_number: ctx.callerE164,
    status: ctx.isTestCaller ? "ended_success" : "missed",
    status_label: label,
    summary: ctx.isTestCaller
      ? `Llamada de prueba desde ${ctx.callerE164} al agente ${ctx.agent?.name ?? ""}.`
      : "Llamada entrante recibida.",
    metadata: {
      direction: "inbound",
      is_test_call: ctx.isTestCaller,
      provider: ctx.phone.provider,
      to: ctx.phone.e164,
      ...meta
    }
  });
}
