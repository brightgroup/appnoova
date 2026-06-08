import { NextRequest, NextResponse } from "next/server";
import {
  agentGreeting,
  logPhoneTestCall,
  resolveAgentLine,
  resolveOutboundTest,
  resolveOutboundTestFromState
} from "@/lib/telephony/phone-call";
import { answerAndSpeak, telnyxStartMediaStream } from "@/lib/telephony/telnyx-call-control";
import { telnyxMediaStreamWsUrl } from "@/lib/telephony/app-url";
import { loadVoiceAgentForCall } from "@/lib/telephony/load-voice-agent";
import {
  closeActiveBridge,
  hasActiveBridge,
  setPendingBridgeSession
} from "@/lib/telephony/bridge-session-store";
import { finalizePhoneTestCall } from "@/lib/telephony/finalize-phone-test-call";
import {
  decodeTelnyxClientState,
  getPhoneTestCallSession,
  isPhoneTestCall,
  labelForPhase,
  updatePhoneTestCallSession,
  type PhoneTestCallPhase
} from "@/lib/telephony/test-call-session";

function isOutbound(direction: string): boolean {
  return direction === "outgoing" || direction === "outbound";
}

async function resolveTestContext(
  callControlId: string,
  payload: Record<string, unknown>,
  from: string,
  to: string,
  direction: string
) {
  const state = decodeTelnyxClientState(payload.client_state);
  if (state?.type === "test_outbound") {
    const ctx = await resolveOutboundTestFromState(state);
    if (ctx) return { ctx, state };
  }

  const session = await getPhoneTestCallSession(callControlId);
  if (session?.metadata.phone_number_id && session.metadata.test_number_id) {
    const ctx = await resolveOutboundTestFromState({
      type: "test_outbound",
      user_id: session.user_id,
      voice_agent_id: session.voice_agent_id,
      phone_number_id: session.metadata.phone_number_id,
      test_number_id: session.metadata.test_number_id
    });
    if (ctx) return { ctx, state: null };
  }

  if (isOutbound(direction)) {
    const ctx = await resolveOutboundTest(from, to);
    if (ctx) return { ctx, state: null };
  }
  return null;
}

async function handleOutboundAnswered(
  callId: string,
  payload: Record<string, unknown>,
  from: string,
  to: string,
  direction: string
) {
  const resolved = await resolveTestContext(callId, payload, from, to, direction);
  if (!resolved?.ctx?.agent) {
    console.warn("[telnyx:voice] outbound answered sin contexto", { from, to, callId });
    await updatePhoneTestCallSession(callId, {
      phase: "failed",
      last_event: "call.answered",
      error: "No se pudo resolver el agente para esta llamada",
      status_label: labelForPhase("failed")
    });
    return;
  }

  const { ctx, state } = resolved;
  const session = await getPhoneTestCallSession(callId);
  const agent = await loadVoiceAgentForCall(ctx.agent.id, ctx.phone.user_id);
  if (!agent || !session) {
    console.warn("[telnyx:voice] sin agente o sesión para bridge", callId);
    return;
  }

  setPendingBridgeSession({
    callControlId: callId,
    callRecordId: session.id,
    userId: ctx.phone.user_id,
    voiceAgentId: ctx.agent.id,
    from: ctx.phone.e164,
    to: ctx.destinationE164,
    agentName: agent.agentName,
    config: agent.config,
    companyContextText: agent.companyContextText,
    preparedAt: Date.now()
  });

  await updatePhoneTestCallSession(callId, {
    phase: "answered",
    last_event: "call.answered",
    status_label: labelForPhase("answered")
  });

  try {
    const streamUrl = telnyxMediaStreamWsUrl();
    console.info("[telnyx:voice] iniciando media stream", { callId, streamUrl });
    await telnyxStartMediaStream(callId, streamUrl);
  } catch (e) {
    console.error("[telnyx:voice] streaming_start error:", e);
    const greeting = agentGreeting(ctx.agent.name, ctx.agent.prompt);
    await updatePhoneTestCallSession(callId, {
      phase: "failed",
      last_event: "streaming_start.error",
      error: e instanceof Error ? e.message : "No se pudo iniciar el audio del agente",
      status_label: labelForPhase("failed")
    });
    console.warn("[telnyx:voice] fallback greeting only — stream failed", greeting);
  }
}

/** Webhook Telnyx Call Control — inbound y outbound de prueba. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const data = body.data ?? body;
  const eventType = data?.event_type ?? "";
  const payload = (data?.payload ?? {}) as Record<string, unknown>;
  const to = String(payload.to ?? payload.called_number ?? "");
  const from = String(payload.from ?? payload.caller_number ?? "");
  const callId = String(payload.call_control_id ?? data?.id ?? "");
  const direction = String(payload.direction ?? "");

  console.info("[telnyx:voice]", { eventType, from, to, callId, direction });

  if (!callId) return NextResponse.json({ ok: true });

  const testCall = await isPhoneTestCall(callId);

  const phaseByEvent: Record<string, PhoneTestCallPhase> = {
    "call.initiated": isOutbound(direction) || testCall ? "ringing" : "dialing",
    "call.ringing": "ringing",
    "call.speak.started": "speaking",
    "call.speak.ended": "connected",
    "call.hangup": "ended"
  };

  if (testCall && phaseByEvent[eventType]) {
    await updatePhoneTestCallSession(callId, {
      phase: phaseByEvent[eventType],
      last_event: eventType,
      status_label: labelForPhase(phaseByEvent[eventType])
    });
  }

  if (eventType === "call.hangup" && testCall) {
    const bridged = hasActiveBridge(callId);
    await closeActiveBridge(callId, "Phone Hangup");
    if (!bridged) {
      const row = await getPhoneTestCallSession(callId);
      if (row && !row.metadata.finalized) {
        await finalizePhoneTestCall({
          callControlId: callId,
          transcript: [],
          disconnectReason: "Phone Hangup"
        });
      }
    }
  }

  if (eventType === "call.answered" && (isOutbound(direction) || testCall)) {
    await handleOutboundAnswered(callId, payload, from, to, direction);
  }

  if (eventType === "call.initiated" && !isOutbound(direction) && !testCall && to) {
    const inboundCtx = await resolveAgentLine(to);
    if (inboundCtx?.agent) {
      const greeting = agentGreeting(inboundCtx.agent.name, inboundCtx.agent.prompt);
      try {
        await answerAndSpeak(callId, greeting);
      } catch (e) {
        console.error("[telnyx:voice] inbound answer/speak error:", e);
      }
      await logPhoneTestCall(inboundCtx, {
        direction: "inbound",
        counterpartyE164: from || "Desconocido",
        isTest: false,
        meta: { telnyx_call_id: callId, event_type: eventType }
      });
    }
  }

  return NextResponse.json({ ok: true });
}
