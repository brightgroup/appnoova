import { analyzeCallTranscript } from "@/lib/call-analysis";
import { buildFallbackSummary, estimateCallCredits } from "@/lib/voice-call-utils";
import type { TranscriptEntry } from "@/types/voice-agent-call";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PersistCallInput {
  userId: string;
  voiceAgentId: string;
  agentName: string;
  phoneNumber: string;
  durationSec: number;
  disconnectReason: string;
  transcript: TranscriptEntry[];
  metadata?: Record<string, unknown>;
  statusLabel?: string;
  skipAnalysis?: boolean;
  callsCount?: number;
}

export async function buildCallRecordFields(input: PersistCallInput) {
  const now = new Date();
  const analysis = input.skipAnalysis ? null : await analyzeCallTranscript(input.transcript);
  const summary = analysis?.summary || buildFallbackSummary(input.transcript);
  const userSentiment = analysis?.user_sentiment || "Neutral";
  const extractedData = analysis?.extracted_data ?? {};
  const durationSec = Math.max(0, input.durationSec);
  const credits = estimateCallCredits(durationSec);

  return {
    phone_number: input.phoneNumber,
    duration_sec: durationSec,
    credits,
    status: "ended_success",
    status_label: input.statusLabel ?? "Ended - Llamada exitosa",
    in_voicemail: false,
    disconnect_reason: input.disconnectReason,
    user_sentiment: userSentiment,
    summary,
    extracted_data: extractedData,
    dynamic_variables: {
      contact_name: "",
      contact_email: "",
      current_time: now.toLocaleString("es-CO", { dateStyle: "full", timeStyle: "long" }),
      agent_name: input.agentName
    },
    transcript: input.transcript,
    metadata: {
      analyzed_at: analysis ? now.toISOString() : null,
      ...(input.metadata ?? {})
    },
    callsCountNext: (input.callsCount ?? 0) + 1,
    analysisUsage: analysis?.usage ?? null
  };
}

/** Separa campos de BD, contador interno y uso de Gemini del análisis (no son columnas de voice_agent_calls). */
export function splitCallRecordFields(fields: Awaited<ReturnType<typeof buildCallRecordFields>>) {
  const { callsCountNext, analysisUsage, ...dbFields } = fields;
  return { dbFields, callsCountNext, analysisUsage };
}

export async function updateAgentCallsCount(
  db: SupabaseClient,
  agentId: string,
  nextCount: number
) {
  await db.from("voice_agents").update({ calls_count: nextCount }).eq("id", agentId);
}
