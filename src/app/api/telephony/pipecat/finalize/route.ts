import { NextRequest, NextResponse } from "next/server";
import { finalizePhoneTestCall } from "@/lib/telephony/finalize-phone-test-call";
import { isPipecatInternalRequest } from "@/lib/telephony/pipecat-auth";
import type { TranscriptEntry } from "@/types/voice-agent-call";

/** POST — cierre de llamada desde Pipecat (auth interna, idempotente). */
export async function POST(req: NextRequest) {
  if (!isPipecatInternalRequest(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const callControlId = String(body.call_control_id ?? "").trim();
  if (!callControlId) {
    return NextResponse.json({ error: "call_control_id requerido" }, { status: 400 });
  }

  const transcript = Array.isArray(body.transcript) ? (body.transcript as TranscriptEntry[]) : [];
  const disconnectReason = String(body.disconnect_reason ?? "Phone Hangup").trim() || "Phone Hangup";
  const durationSec = typeof body.duration_sec === "number" ? body.duration_sec : undefined;

  await finalizePhoneTestCall({
    callControlId,
    transcript,
    disconnectReason,
    durationSec
  });

  return NextResponse.json({ success: true });
}
