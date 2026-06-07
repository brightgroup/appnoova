import { NextRequest, NextResponse } from "next/server";

/** Webhook Twilio — eventos de estado de llamada (logging MVP). */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const callSid = form.get("CallSid");
  const callStatus = form.get("CallStatus");

  console.info("[twilio:status]", { callSid, callStatus });

  return NextResponse.json({ ok: true });
}
