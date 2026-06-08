import { adminClient } from "@/lib/voice-agents-server";

export type PhoneTestCallPhase =
  | "dialing"
  | "ringing"
  | "answered"
  | "speaking"
  | "connected"
  | "ended"
  | "failed";

export interface PhoneTestCallMeta {
  phone_test: true;
  call_control_id: string;
  phase: PhoneTestCallPhase;
  from: string;
  to: string;
  phone_number_id?: string;
  test_number_id?: string;
  agent_name?: string;
  last_event?: string;
  error?: string;
  greeting?: string;
  answered_at?: string;
  ended_at?: string;
  finalized?: boolean;
}

export async function createPhoneTestCallSession(input: {
  userId: string;
  voiceAgentId: string;
  callControlId: string;
  phoneNumberId: string;
  testNumberId: string;
  from: string;
  to: string;
  agentName: string;
}): Promise<string> {
  const db = adminClient();
  const metadata: PhoneTestCallMeta = {
    phone_test: true,
    call_control_id: input.callControlId,
    phase: "dialing",
    from: input.from,
    to: input.to,
    phone_number_id: input.phoneNumberId,
    test_number_id: input.testNumberId,
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
      status_label: "Prueba telefónica - Marcando",
      summary: `Llamada de prueba de ${input.agentName} hacia ${input.to}.`,
      metadata
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo registrar la llamada");
  return data.id as string;
}

export async function getPhoneTestCallSession(callControlId: string) {
  const db = adminClient();
  const { data: rows } = await db
    .from("voice_agent_calls")
    .select("id, user_id, voice_agent_id, metadata, status, status_label, created_at")
    .contains("metadata", { phone_test: true, call_control_id: callControlId })
    .order("created_at", { ascending: false })
    .limit(1);

  const row = rows?.[0];
  if (!row) return null;
  return {
    ...row,
    metadata: (row.metadata ?? {}) as PhoneTestCallMeta
  };
}

export async function isPhoneTestCall(callControlId: string): Promise<boolean> {
  const session = await getPhoneTestCallSession(callControlId);
  return Boolean(session);
}

async function findSessionRow(callControlId: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const session = await getPhoneTestCallSession(callControlId);
    if (session) return session;
    if (i < retries - 1) await new Promise(r => setTimeout(r, 400));
  }
  return null;
}

export async function updatePhoneTestCallSession(
  callControlId: string,
  patch: Partial<PhoneTestCallMeta> & { status_label?: string; summary?: string }
): Promise<void> {
  const row = await findSessionRow(callControlId);
  if (!row) return;

  const prev = row.metadata;
  const metadata: PhoneTestCallMeta = { ...prev, ...patch, phone_test: true, call_control_id: callControlId };

  if (patch.phase === "answered" && !metadata.answered_at) {
    metadata.answered_at = new Date().toISOString();
  }
  if (patch.phase === "ended" && !metadata.ended_at) {
    metadata.ended_at = new Date().toISOString();
  }

  const status =
    metadata.phase === "ended" ? "ended_success" :
    metadata.phase === "failed" ? "missed" :
    "in_progress";

  const db = adminClient();
  await db
    .from("voice_agent_calls")
    .update({
      status,
      status_label: patch.status_label ?? labelForPhase(metadata.phase),
      ...(patch.summary ? { summary: patch.summary } : {}),
      metadata
    })
    .eq("id", row.id);
}

export function labelForPhase(phase: PhoneTestCallPhase): string {
  switch (phase) {
    case "dialing": return "Prueba telefónica - Marcando";
    case "ringing": return "Prueba telefónica - Sonando";
    case "answered": return "Prueba telefónica - Contestada";
    case "speaking": return "Prueba telefónica - Agente hablando";
    case "connected": return "Prueba telefónica - En llamada";
    case "ended": return "Prueba telefónica - Finalizada";
    case "failed": return "Prueba telefónica - Error";
    default: return "Prueba telefónica";
  }
}

export function computeConnectedDuration(meta: PhoneTestCallMeta): number {
  if (!meta.answered_at) return 0;
  const end = meta.ended_at ? new Date(meta.ended_at).getTime() : Date.now();
  return Math.max(0, Math.floor((end - new Date(meta.answered_at).getTime()) / 1000));
}

export function encodeTelnyxClientState(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

export function decodeTelnyxClientState(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
