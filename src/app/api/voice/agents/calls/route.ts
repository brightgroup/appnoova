import { NextRequest, NextResponse } from "next/server";
import { analyzeCallTranscript } from "@/lib/call-analysis";
import { deriveQualityLabel } from "@/lib/voice-agent-display";
import { buildFallbackSummary } from "@/lib/voice-call-utils";
import { creditsForVoiceDuration } from "@/lib/billing/pricing";
import { uploadCallRecording } from "@/lib/voice-call-storage";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";
import {
  billingBlockedMessage,
  chargeVoiceCall,
  checkBillingForUser,
  resolveOrgIdForUser
} from "@/lib/billing/meter";
import type { TranscriptEntry, VoiceAgentCallRecord } from "@/types/voice-agent-call";
import { getElevenLabsConversation } from "@/lib/elevenlabs/outbound-call";
import { syncOpenElevenLabsCampaignCalls, backfillMissingCampaignAudio } from "@/lib/elevenlabs/sync-open-campaign-calls";
import {
  getElevenLabsConversationAudioWithRetry,
  waitForElevenLabsConversationReady,
} from "@/lib/elevenlabs/premium-voices";

interface CallPostBody {
  voice_agent_id?: string;
  agent_id?: string;
  phone_number?: string;
  duration_sec?: number;
  disconnect_reason?: string;
  status_label?: string;
  in_voicemail?: boolean;
  user_sentiment?: string;
  summary?: string;
  extracted_data?: Record<string, unknown>;
  dynamic_variables?: Record<string, unknown>;
  transcript?: TranscriptEntry[];
  audio_url?: string | null;
  audio_base64?: string;
  audio_mime?: string;
  metadata?: Record<string, unknown>;
  credits?: number;
  skip_analysis?: boolean;
}

async function backfillPremiumCallAudio(
  db: ReturnType<typeof adminClient>,
  userId: string,
  callId: string,
  conversationId: string
): Promise<string | null> {
  await waitForElevenLabsConversationReady(conversationId, { maxAttempts: 8, delayMs: 750 });
  const audio = await getElevenLabsConversationAudioWithRetry(conversationId, {
    maxAttempts: 5,
    delayMs: 1200,
  });
  if (!audio?.buffer.length) return null;

  const audioUrl = await uploadCallRecording(
    db,
    userId,
    callId,
    audio.buffer,
    audio.contentType || "audio/mpeg"
  );
  if (audioUrl) {
    await db.from("voice_agent_calls").update({ audio_url: audioUrl }).eq("id", callId);
  }
  return audioUrl;
}

async function enrichPremiumWebCall(input: {
  conversationId: string;
  clientTranscript: TranscriptEntry[];
  clientDurationSec: number;
}): Promise<{
  transcript: TranscriptEntry[];
  durationSec: number;
  audioBuffer: Buffer | null;
  audioMime: string | null;
}> {
  await waitForElevenLabsConversationReady(input.conversationId);

  let transcript = input.clientTranscript;
  let durationSec = input.clientDurationSec;

  try {
    const conv = await getElevenLabsConversation(input.conversationId);
    if (conv.transcript.length > transcript.length) {
      transcript = conv.transcript;
    }
    if (conv.callDurationSecs > durationSec) {
      durationSec = conv.callDurationSecs;
    }
  } catch (err) {
    console.warn("[calls] enrich premium transcript:", err);
  }

  let audioBuffer: Buffer | null = null;
  let audioMime: string | null = null;
  try {
    const audio = await getElevenLabsConversationAudioWithRetry(input.conversationId);
    if (audio) {
      audioBuffer = audio.buffer;
      audioMime = audio.contentType;
    }
  } catch (err) {
    console.warn("[calls] enrich premium audio:", err);
  }

  return { transcript, durationSec, audioBuffer, audioMime };
}

async function parseCallPostBody(req: NextRequest): Promise<{
  body: CallPostBody;
  audioBlob: Blob | null;
}> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const payload = form.get("payload");
    const body = payload
      ? (JSON.parse(String(payload)) as CallPostBody)
      : ({} as CallPostBody);
    const audioEntry = form.get("audio");
    let audioBlob: Blob | null = null;
    if (audioEntry instanceof Blob && audioEntry.size > 0) {
      audioBlob = audioEntry;
    } else if (audioEntry && typeof audioEntry === "object" && "arrayBuffer" in audioEntry) {
      const buf = await (audioEntry as Blob).arrayBuffer();
      if (buf.byteLength > 0) {
        audioBlob = new Blob([buf], { type: (audioEntry as { type?: string }).type || "audio/webm" });
      }
    }
    return { body, audioBlob };
  }
  const body = (await req.json()) as CallPostBody;
  let audioBlob: Blob | null = null;
  if (body.audio_base64 && body.audio_base64.length > 0) {
    const mime = body.audio_mime || "audio/wav";
    const buf = Buffer.from(body.audio_base64, "base64");
    if (buf.length > 0) audioBlob = new Blob([buf], { type: mime });
  }
  return { body, audioBlob };
}

function toRecord(raw: Record<string, unknown>): VoiceAgentCallRecord {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    voice_agent_id: String(raw.voice_agent_id),
    phone_number: String(raw.phone_number ?? "Prueba web"),
    duration_sec: Number(raw.duration_sec) || 0,
    credits: Number(raw.credits) || 0,
    status: String(raw.status ?? "ended_success"),
    status_label: String(raw.status_label ?? "Ended - Llamada exitosa"),
    in_voicemail: Boolean(raw.in_voicemail),
    disconnect_reason: String(raw.disconnect_reason ?? "Agent Hangup"),
    user_sentiment: String(raw.user_sentiment ?? "Neutral"),
    summary: String(raw.summary ?? ""),
    extracted_data: (raw.extracted_data as Record<string, unknown>) ?? {},
    dynamic_variables: (raw.dynamic_variables as Record<string, unknown>) ?? {},
    transcript: (raw.transcript as TranscriptEntry[]) ?? [],
    audio_url: raw.audio_url ? String(raw.audio_url) : null,
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    created_at: String(raw.created_at ?? "")
  };
}

/**
 * GET /api/voice/agents/calls?agent_id= → lista
 * GET /api/voice/agents/calls?id= → detalle
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const db = adminClient();
  const id = req.nextUrl.searchParams.get("id");
  const agentId = req.nextUrl.searchParams.get("agent_id");

  if (id) {
    const { data, error } = await db
      .from("voice_agent_calls")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") return NextResponse.json({ call: null, dbReady: false });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Llamada no encontrada" }, { status: 404 });

    let callRow = data as Record<string, unknown>;
    if (!callRow.audio_url) {
      const meta = (callRow.metadata as Record<string, unknown>) ?? {};
      const conversationId = String(meta.conversation_id ?? "").trim();
      if (conversationId && meta.voice_provider === "elevenlabs") {
        const audioUrl = await backfillPremiumCallAudio(
          db,
          userId,
          String(callRow.id),
          conversationId
        );
        if (audioUrl) callRow = { ...callRow, audio_url: audioUrl };
      }
    }

    return NextResponse.json({ call: toRecord(callRow), dbReady: true });
  }

  // Registro unificado:
  //  - agent_id → llamadas del agente (todas sus campañas)
  //  - campaign_id → llamadas de una campaña
  //  - sin filtro → historial global del usuario (todos los agentes)
  const campaignId = req.nextUrl.searchParams.get("campaign_id");

  if (campaignId) {
    try {
      await syncOpenElevenLabsCampaignCalls();
      await backfillMissingCampaignAudio(8);
    } catch (err) {
      console.warn("[calls] sync campaign EL:", err);
    }
  }

  const forExport = req.nextUrl.searchParams.get("export") === "1";

  let query = forExport
    ? db
        .from("voice_agent_calls")
        .select(
          "id, voice_agent_id, campaign_id, phone_number, duration_sec, credits, status, status_label, in_voicemail, disconnect_reason, user_sentiment, summary, audio_url, metadata, created_at, transcript, extracted_data"
        )
    : db
        .from("voice_agent_calls")
        .select(
          "id, voice_agent_id, campaign_id, phone_number, duration_sec, credits, status, status_label, in_voicemail, disconnect_reason, user_sentiment, summary, audio_url, metadata, created_at"
        );

  query = query.eq("user_id", userId).order("created_at", { ascending: false });

  if (agentId) query = query.eq("voice_agent_id", agentId);
  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;

  if (error) {
    if (error.code === "42P01") return NextResponse.json({ calls: [], dbReady: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    calls: (data ?? []).map(row => toRecord(row as Record<string, unknown>)),
    dbReady: true,
  });
}

/** POST — guarda registro, sube audio, analiza con IA y actualiza contador */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: CallPostBody;
  let audioBlob: Blob | null;
  try {
    ({ body, audioBlob } = await parseCallPostBody(req));
  } catch {
    return NextResponse.json({ error: "Cuerpo de solicitud inválido" }, { status: 400 });
  }

  const agentId = String(body.voice_agent_id ?? body.agent_id ?? "");
  if (!agentId) {
    return NextResponse.json({ error: "voice_agent_id requerido" }, { status: 400 });
  }

  const db = adminClient();

  let agentRow: { id: string; name: string; calls_count?: number; voice_provider?: string } | null = null;

  const { data: agentWithStats, error: statsErr } = await db
    .from("voice_agents")
    .select("id, name, calls_count, voice_provider")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (statsErr?.message?.includes("calls_count")) {
    const { data: agentBasic, error: basicErr } = await db
      .from("voice_agents")
      .select("id, name, voice_provider")
      .eq("id", agentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (basicErr) return NextResponse.json({ error: basicErr.message }, { status: 500 });
    agentRow = agentBasic ? { ...agentBasic, calls_count: 0 } : null;
  } else if (statsErr) {
    return NextResponse.json({ error: statsErr.message }, { status: 500 });
  } else {
    agentRow = agentWithStats;
  }

  if (!agentRow) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  const billing = await checkBillingForUser(db, userId);
  if (!billing.allowed) {
    return NextResponse.json(
      { error: billingBlockedMessage(billing.reason), code: billing.reason },
      { status: 402 }
    );
  }

  const voiceProvider = agentRow.voice_provider === "elevenlabs" ? "elevenlabs" : "google";
  let transcript = (body.transcript ?? []) as TranscriptEntry[];
  let durationSec = Number(body.duration_sec) || 0;
  let premiumAudioBuffer: Buffer | null = null;
  let premiumAudioMime: string | null = null;

  const conversationId = String(body.metadata?.conversation_id ?? "").trim();
  if (voiceProvider === "elevenlabs" && conversationId) {
    const enriched = await enrichPremiumWebCall({
      conversationId,
      clientTranscript: transcript,
      clientDurationSec: durationSec,
    });
    transcript = enriched.transcript;
    durationSec = enriched.durationSec;
    premiumAudioBuffer = enriched.audioBuffer;
    premiumAudioMime = enriched.audioMime;
  }

  const credits = Number(body.credits) || creditsForVoiceDuration(durationSec, voiceProvider);
  const now = new Date();

  const analysis = body.skip_analysis
    ? null
    : await analyzeCallTranscript(transcript);

  const summary = body.summary || analysis?.summary || buildFallbackSummary(transcript);
  const userSentiment = body.user_sentiment || analysis?.user_sentiment || "Neutral";
  const extractedData = body.extracted_data ?? analysis?.extracted_data ?? {};

  const row = {
    user_id: userId,
    voice_agent_id: agentId,
    phone_number: String(body.phone_number ?? "Prueba web"),
    duration_sec: durationSec,
    credits,
    status: "ended_success",
    status_label: String(body.status_label ?? "Ended - Llamada exitosa"),
    in_voicemail: Boolean(body.in_voicemail),
    disconnect_reason: String(body.disconnect_reason ?? "Agent Hangup"),
    user_sentiment: userSentiment,
    summary,
    extracted_data: extractedData,
    dynamic_variables: body.dynamic_variables ?? {
      contact_name: "",
      contact_email: "",
      current_time: now.toLocaleString("es-CO", { dateStyle: "full", timeStyle: "long" }),
      agent_name: agentRow.name
    },
    transcript,
    audio_url: body.audio_url ?? null,
    metadata: {
      source: "web_test",
      analyzed_at: analysis ? now.toISOString() : null,
      ...(body.metadata ?? {})
    }
  };

  const { data: call, error: insertErr } = await db
    .from("voice_agent_calls")
    .insert(row)
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === "42P01") {
      return NextResponse.json({
        error: "Ejecuta la migración 006_voice_agent_calls.sql en Supabase"
      }, { status: 500 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  let audioUrl = call.audio_url as string | null;

  if (call.id && !audioBlob && premiumAudioBuffer && premiumAudioBuffer.length > 0) {
    audioUrl = await uploadCallRecording(
      db,
      userId,
      String(call.id),
      premiumAudioBuffer,
      premiumAudioMime || "audio/mpeg"
    );
    if (audioUrl) {
      await db.from("voice_agent_calls").update({ audio_url: audioUrl }).eq("id", call.id);
      call.audio_url = audioUrl;
    }
  }

  if (call.id && audioBlob && audioBlob.size > 0) {
    const buffer = Buffer.from(await audioBlob.arrayBuffer());
    const contentType = audioBlob.type || body.audio_mime || "audio/wav";
    audioUrl = await uploadCallRecording(db, userId, String(call.id), buffer, contentType);
    if (audioUrl) {
      await db.from("voice_agent_calls").update({ audio_url: audioUrl }).eq("id", call.id);
      call.audio_url = audioUrl;
    } else {
      console.error("[calls] No se pudo subir audio para llamada", call.id, "tipo:", contentType, "bytes:", buffer.length);
    }
  }

  const calls = (Number(agentRow.calls_count) || 0) + 1;
  await db
    .from("voice_agents")
    .update({
      calls_count: calls,
      quality_label: deriveQualityLabel(calls),
      updated_at: now.toISOString()
    })
    .eq("id", agentId)
    .eq("user_id", userId);

  const orgId = billing.organizationId ?? (await resolveOrgIdForUser(db, userId));
  if (orgId && durationSec > 0) {
    await chargeVoiceCall({
      db,
      organizationId: orgId,
      userId,
      callId: String(call.id),
      durationSec,
      voiceAgentId: agentId,
      voiceProvider,
      channel: "web_test",
      metadata: { source: "web_test" }
    });
  }

  return NextResponse.json({ call: toRecord({ ...call, audio_url: audioUrl }) });
}
