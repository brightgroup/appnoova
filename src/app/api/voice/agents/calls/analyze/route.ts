import { NextRequest, NextResponse } from "next/server";
import { analyzeCallTranscript } from "@/lib/call-analysis";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";
import type { TranscriptEntry } from "@/types/voice-agent-call";

/** POST /api/voice/agents/calls/analyze?id= — re-analiza una llamada existente */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const callId = req.nextUrl.searchParams.get("id");
  if (!callId) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: call, error: fetchErr } = await db
    .from("voice_agent_calls")
    .select("id, transcript, metadata")
    .eq("id", callId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!call) {
    return NextResponse.json({ error: "Llamada no encontrada" }, { status: 404 });
  }

  const transcript = (call.transcript ?? []) as TranscriptEntry[];
  const analysis = await analyzeCallTranscript(transcript);

  const { data: updated, error: updateErr } = await db
    .from("voice_agent_calls")
    .update({
      summary: analysis.summary,
      user_sentiment: analysis.user_sentiment,
      extracted_data: analysis.extracted_data,
      metadata: {
        ...((call.metadata as Record<string, unknown>) ?? {}),
        analyzed_at: new Date().toISOString(),
        reanalyzed: true
      }
    })
    .eq("id", callId)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ call: updated, analysis });
}
