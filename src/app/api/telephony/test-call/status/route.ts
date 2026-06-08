import { NextRequest, NextResponse } from "next/server";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";
import { computeConnectedDuration, type PhoneTestCallMeta } from "@/lib/telephony/test-call-session";

/** GET — estado de una llamada de prueba telefónica. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const callControlId = new URL(req.url).searchParams.get("call_control_id")?.trim();
  if (!callControlId) {
    return NextResponse.json({ error: "call_control_id requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data: row } = await db
    .from("voice_agent_calls")
    .select("id, status, status_label, metadata, created_at")
    .eq("user_id", userId)
    .contains("metadata", { phone_test: true, call_control_id: callControlId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Llamada no encontrada" }, { status: 404 });
  }

  const meta = (row.metadata ?? {}) as PhoneTestCallMeta;
  const phase = meta.phase ?? "dialing";
  const connected = ["answered", "speaking", "connected", "ended"].includes(phase);

  return NextResponse.json({
    call_id: row.id,
    call_control_id: callControlId,
    phase,
    status: row.status,
    status_label: row.status_label,
    from: meta.from,
    to: meta.to,
    agent_name: meta.agent_name,
    last_event: meta.last_event,
    greeting: meta.greeting,
    error: meta.error,
    answered_at: meta.answered_at ?? null,
    ended_at: meta.ended_at ?? null,
    duration_sec: connected ? computeConnectedDuration(meta) : 0
  });
}
