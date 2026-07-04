import { adminClient } from "@/lib/voice-agents-server";
import { campaignLabelForPhase } from "@/lib/call-engine/campaign-call-session";

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
  voice_provider?: "google" | "elevenlabs";
  conversation_id?: string;
  last_event?: string;
  error?: string;
  greeting?: string;
  answered_at?: string;
  ended_at?: string;
  finalized?: boolean;
  /** Esperando resultado AMD de Telnyx antes de activar el agente. */
  amd_pending?: boolean;
  amd_result?: string;
  voicemail_detected?: boolean;
  outcome?: string;
  agent_skipped?: boolean;
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
  voiceProvider?: "google" | "elevenlabs";
}): Promise<string> {
  const db = adminClient();
  const isPremium = input.voiceProvider === "elevenlabs";
  const metadata: PhoneTestCallMeta = {
    phone_test: true,
    call_control_id: input.callControlId,
    phase: "dialing",
    from: input.from,
    to: input.to,
    phone_number_id: input.phoneNumberId || undefined,
    test_number_id: input.testNumberId,
    agent_name: input.agentName,
    voice_provider: isPremium ? "elevenlabs" : "google",
    ...(isPremium ? { conversation_id: input.callControlId } : {}),
    last_event: isPremium ? "elevenlabs.dialing" : "call.dialing"
  };

  const { data, error } = await db
    .from("voice_agent_calls")
    .insert({
      user_id: input.userId,
      voice_agent_id: input.voiceAgentId,
      phone_number: input.to,
      status: "in_progress",
      status_label: isPremium ? "Prueba premium - Marcando" : "Prueba telefónica - Marcando",
      summary: `Llamada de prueba de ${input.agentName} hacia ${input.to}.`,
      metadata
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo registrar la llamada");
  return data.id as string;
}

export interface PhoneTestCallSessionRow {
  id: string;
  user_id: string;
  voice_agent_id: string;
  campaign_id?: string | null;
  campaign_audience_row_id?: string | null;
  metadata: PhoneTestCallMeta;
  status: string;
  status_label: string;
  created_at: string;
}

export async function getPhoneTestCallSession(callControlId: string): Promise<PhoneTestCallSessionRow | null> {
  const db = adminClient();
  const { data: rows, error } = await db
    .from("voice_agent_calls")
    .select("id, user_id, voice_agent_id, campaign_id, campaign_audience_row_id, metadata, status, status_label, created_at")
    .or(
      `metadata->>call_control_id.eq.${callControlId},metadata->>conversation_id.eq.${callControlId},metadata->>screening_call_id.eq.${callControlId}`
    )
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[test-call-session] lookup failed:", error.message, callControlId);
    return null;
  }

  const row = rows?.[0];
  if (!row) return null;
  return {
    ...row,
    campaign_id: row.campaign_id as string | null | undefined,
    campaign_audience_row_id: row.campaign_audience_row_id as string | null | undefined,
    metadata: (row.metadata ?? {}) as PhoneTestCallMeta,
  };
}

export async function isPhoneTestCall(callControlId: string): Promise<boolean> {
  const session = await getPhoneTestCallSession(callControlId);
  if (!session) return false;
  const meta = session.metadata as {
    phone_test?: boolean;
    crm_outbound?: boolean;
    campaign_outbound?: boolean;
  };
  return Boolean(meta.phone_test || meta.crm_outbound || meta.campaign_outbound);
}

export type ManagedOutboundKind = "test" | "crm" | "campaign";

export function managedOutboundKind(meta: Record<string, unknown>): ManagedOutboundKind {
  if (meta.campaign_outbound) return "campaign";
  if (meta.crm_outbound) return "crm";
  return "test";
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
  const kind = managedOutboundKind(prev as unknown as Record<string, unknown>);
  const metadata = {
    ...prev,
    ...patch,
    call_control_id: callControlId,
    ...(kind === "campaign"
      ? { campaign_outbound: true as const, phone_test: false as const, crm_outbound: false as const }
      : kind === "crm"
        ? { crm_outbound: true as const, phone_test: false as const }
        : { phone_test: true as const }),
  };

  if (patch.phase === "answered" && !metadata.answered_at) {
    metadata.answered_at = new Date().toISOString();
  }
  if (patch.phase === "ended" && !metadata.ended_at) {
    metadata.ended_at = new Date().toISOString();
  }

  const outcome = String(patch.outcome ?? metadata.outcome ?? "").trim();
  const isVoicemail =
    patch.voicemail_detected === true ||
    metadata.voicemail_detected === true ||
    outcome === "voicemail";
  const status =
    isVoicemail
      ? "voicemail"
      : metadata.finalized && (outcome === "no_answer" || outcome === "busy" || outcome === "failed")
        ? "missed"
        : metadata.phase === "ended"
          ? "ended_success"
          : metadata.phase === "failed"
            ? "missed"
            : "in_progress";

  const db = adminClient();
  await db
    .from("voice_agent_calls")
    .update({
      status,
      status_label: patch.status_label ?? labelForManagedOutboundPhase(metadata.phase as PhoneTestCallPhase, kind),
      ...(isVoicemail ? { in_voicemail: true } : {}),
      ...(patch.summary ? { summary: patch.summary } : {}),
      metadata,
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

export function labelForManagedOutboundPhase(
  phase: PhoneTestCallPhase,
  kind: ManagedOutboundKind | boolean
): string {
  const resolved: ManagedOutboundKind =
    typeof kind === "boolean" ? (kind ? "crm" : "test") : kind;
  if (resolved === "test") return labelForPhase(phase);
  if (resolved === "campaign") return campaignLabelForPhase(phase);
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
