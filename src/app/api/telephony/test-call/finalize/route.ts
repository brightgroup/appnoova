import { NextRequest, NextResponse } from "next/server";
import { finalizePhoneTestCall } from "@/lib/telephony/finalize-phone-test-call";
import { getPhoneTestCallSession } from "@/lib/telephony/test-call-session";
import { getUserIdFromRequest } from "@/lib/voice-agents-server";

/** POST — asegura cierre del registro de llamada telefónica (idempotente). */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const callControlId = String(body.call_control_id ?? "").trim();
  if (!callControlId) {
    return NextResponse.json({ error: "call_control_id requerido" }, { status: 400 });
  }

  const session = await getPhoneTestCallSession(callControlId);
  if (!session || session.user_id !== userId) {
    return NextResponse.json({ error: "Llamada no encontrada" }, { status: 404 });
  }

  if (!session.metadata.finalized) {
    await finalizePhoneTestCall({
      callControlId,
      transcript: [],
      disconnectReason: "Phone Hangup"
    });
  }

  return NextResponse.json({ success: true, finalized: true });
}
