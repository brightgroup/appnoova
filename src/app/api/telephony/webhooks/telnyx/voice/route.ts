import { NextRequest, NextResponse } from "next/server";
import { agentGreeting, logInboundCall, resolveInboundCall } from "@/lib/telephony/inbound-call";
import { answerAndSpeak } from "@/lib/telephony/telnyx-call-control";

/** Webhook Telnyx Call Control — atiende llamadas de prueba al agente asignado. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const data = body.data ?? body;
  const eventType = data?.event_type ?? "";
  const payload = data?.payload ?? {};
  const to = payload.to ?? payload.called_number ?? "";
  const from = payload.from ?? payload.caller_number ?? "";
  const callId = payload.call_control_id ?? data?.id ?? "";

  console.info("[telnyx:voice]", { eventType, from, to, callId });

  if (eventType === "call.initiated" && to && callId) {
    const ctx = await resolveInboundCall(String(to), String(from));
    if (ctx?.agent) {
      const greeting = agentGreeting(ctx.agent.name, ctx.agent.prompt);

      try {
        await answerAndSpeak(String(callId), greeting);
      } catch (e) {
        console.error("[telnyx:voice] answer/speak error:", e);
      }

      await logInboundCall(ctx, { telnyx_call_id: callId, event_type: eventType });
    }
  }

  return NextResponse.json({ ok: true });
}
