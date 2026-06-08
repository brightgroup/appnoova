import { NextRequest, NextResponse } from "next/server";
import { isPipecatInternalRequest } from "@/lib/telephony/pipecat-auth";
import {
  labelForPhase,
  updatePhoneTestCallSession,
  type PhoneTestCallPhase
} from "@/lib/telephony/test-call-session";

const ALLOWED: PhoneTestCallPhase[] = ["connected", "speaking", "answered"];

/** POST — actualiza fase de llamada para el panel de prueba. */
export async function POST(req: NextRequest) {
  if (!isPipecatInternalRequest(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const callControlId = String(body.call_control_id ?? "").trim();
  const phase = String(body.phase ?? "").trim() as PhoneTestCallPhase;

  if (!callControlId) {
    return NextResponse.json({ error: "call_control_id requerido" }, { status: 400 });
  }
  if (!ALLOWED.includes(phase)) {
    return NextResponse.json({ error: "phase inválida" }, { status: 400 });
  }

  await updatePhoneTestCallSession(callControlId, {
    phase,
    last_event: `pipecat.${phase}`,
    status_label: labelForPhase(phase)
  });

  return NextResponse.json({ success: true });
}
