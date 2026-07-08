import { NextRequest, NextResponse } from "next/server";
import {
  agentGreeting,
  logPhoneTestCall,
  resolveAgentLine,
  resolveOutboundTest,
  resolveOutboundTestFromState
} from "@/lib/telephony/phone-call";
import { answerAndSpeak, speakText, telnyxHangup, telnyxStartMediaStream } from "@/lib/telephony/telnyx-call-control";
import { telnyxStreamUrl } from "@/lib/telephony/app-url";
import { loadVoiceAgentForCall } from "@/lib/telephony/load-voice-agent";
import {
  closeActiveBridge,
  setPendingBridgeSession
} from "@/lib/telephony/bridge-session-store";
import { finalizePhoneTestCall } from "@/lib/telephony/finalize-phone-test-call";
import { finalizeOutboundShortCall } from "@/lib/telephony/finalize-outbound-short-call";
import {
  isAmbiguousAmdResult,
  isHumanAmdResult,
  isHumanAmdResultStrict,
  isMachineAmdResult,
  mapHangupCauseToOutcome,
  shouldSkipAgentForCampaignAmd,
} from "@/lib/telephony/call-outcome";
import { finalizeInboundTelnyxCall } from "@/lib/telephony/finalize-inbound-call";
import {
  decodeTelnyxClientState,
  getPhoneTestCallSession,
  isPhoneTestCall,
  labelForPhase,
  labelForManagedOutboundPhase,
  managedOutboundKind,
  updatePhoneTestCallSession,
  type PhoneTestCallPhase
} from "@/lib/telephony/test-call-session";
import { resolveCrmOutboundFromState } from "@/lib/telephony/crm-call-session";
import { connectCampaignElevenLabsAfterAmd } from "@/lib/elevenlabs/connect-campaign-after-amd";
import { resolveCampaignOutboundFromState } from "@/lib/call-engine/campaign-call-session";
import { adminClient } from "@/lib/voice-agents-server";

function isOutbound(direction: string): boolean {
  return direction === "outgoing" || direction === "outbound";
}

/** Si AMD tarda demasiado, conectar igual (Telnyx recomienda tratar timeout como humano). */
const amdBridgeFallbackMs = 12_000;
const amdFallbackTimers = new Map<string, ReturnType<typeof setTimeout>>();
const amdFallbackContext = new Map<
  string,
  { payload: Record<string, unknown>; from: string; to: string; direction: string }
>();

function clearAmdFallback(callId: string) {
  const t = amdFallbackTimers.get(callId);
  if (t) {
    clearTimeout(t);
    amdFallbackTimers.delete(callId);
  }
  amdFallbackContext.delete(callId);
}

function scheduleAmdBridgeFallback(
  callId: string,
  payload: Record<string, unknown>,
  from: string,
  to: string,
  direction: string
) {
  clearAmdFallback(callId);
  amdFallbackContext.set(callId, { payload, from, to, direction });
  amdFallbackTimers.set(
    callId,
    setTimeout(() => {
      void (async () => {
        const ctx = amdFallbackContext.get(callId);
        amdFallbackContext.delete(callId);
        amdFallbackTimers.delete(callId);
        const session = await getPhoneTestCallSession(callId);
        if (!session?.metadata.amd_pending || session.metadata.finalized) return;

        const meta = session.metadata as unknown as Record<string, unknown>;
        const campaignStrict =
          meta.campaign_outbound === true && meta.el_deferred_amd === true;

        if (campaignStrict) {
          console.warn("[telnyx:voice] AMD sin respuesta — campaña: colgar sin IA", { callId });
          try {
            await telnyxHangup(callId);
          } catch (e) {
            console.error("[telnyx:voice] hangup tras timeout AMD campaña:", e);
          }
          await finalizeOutboundShortCall({
            callControlId: callId,
            outcome: "no_answer",
            disconnectReason: "AMD sin resultado — no se conectó agente premium",
          });
          return;
        }

        // CRM/prueba: Telnyx recomienda tratar timeout AMD como humano.
        console.warn("[telnyx:voice] AMD sin respuesta — conectando agente (timeout)", { callId });
        if (ctx) {
          await handleOutboundAnswered(callId, ctx.payload, ctx.from, ctx.to, ctx.direction);
        }
      })();
    }, amdBridgeFallbackMs)
  );
}

async function handleAmdResult(
  callId: string,
  result: string,
  payload: Record<string, unknown>,
  from: string,
  to: string,
  direction: string
) {
  clearAmdFallback(callId);

  const session = await getPhoneTestCallSession(callId);
  if (!session || session.metadata.finalized) return;

  const sessionMeta = session.metadata as unknown as Record<string, unknown>;
  const campaignStrict =
    sessionMeta.campaign_outbound === true && sessionMeta.el_deferred_amd === true;

  await updatePhoneTestCallSession(callId, {
    amd_pending: false,
    amd_result: result,
    last_event: "call.machine.detection.ended",
    status_label: isMachineAmdResult(result) || (campaignStrict && shouldSkipAgentForCampaignAmd(result))
      ? "Buzón de voz detectado"
      : "Persona detectada — conectando agente",
  });

  if (isMachineAmdResult(result) || (campaignStrict && shouldSkipAgentForCampaignAmd(result))) {
    const outcome = isMachineAmdResult(result) || isAmbiguousAmdResult(result) ? "voicemail" : "no_answer";
    await updatePhoneTestCallSession(callId, {
      voicemail_detected: outcome === "voicemail",
    });
    try {
      await telnyxHangup(callId);
    } catch (e) {
      console.error("[telnyx:voice] hangup tras buzón:", e);
    }
    await finalizeOutboundShortCall({
      callControlId: callId,
      outcome,
      disconnectReason:
        outcome === "voicemail"
          ? `Buzón de voz (${result})`
          : `Sin persona clara (${result})`,
      amdResult: result,
    });
    return;
  }

  const connectHuman = campaignStrict ? isHumanAmdResultStrict(result) : isHumanAmdResult(result);
  if (connectHuman) {
    await handleOutboundAnswered(callId, payload, from, to, direction);
  }
}

async function resolveTestContext(
  callControlId: string,
  payload: Record<string, unknown>,
  from: string,
  to: string,
  direction: string
) {
  const state = decodeTelnyxClientState(payload.client_state);
  if (state?.type === "campaign_outbound") {
    const campaignCtx = await resolveCampaignOutboundFromState(state);
    if (campaignCtx) {
      return {
        ctx: {
          phone: campaignCtx.phone,
          agent: campaignCtx.agent,
          connectionId: campaignCtx.connectionId,
          destinationE164: campaignCtx.destinationE164,
          isTestDestination: false,
        },
        state,
      };
    }
  }
  if (state?.type === "crm_outbound") {
    const crmCtx = await resolveCrmOutboundFromState(state);
    if (crmCtx) {
      return {
        ctx: {
          phone: crmCtx.phone,
          agent: crmCtx.agent,
          connectionId: crmCtx.connectionId,
          destinationE164: crmCtx.destinationE164,
          isTestDestination: false
        },
        state
      };
    }
  }
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

  const { ctx } = resolved;

  let session = await getPhoneTestCallSession(callId);
  for (let i = 0; i < 12 && !session; i++) {
    await new Promise(r => setTimeout(r, 250));
    session = await getPhoneTestCallSession(callId);
  }

  const agent = await loadVoiceAgentForCall(ctx.agent.id, ctx.phone.user_id);
  if (!agent || !session) {
    console.warn("[telnyx:voice] sin agente o sesión para bridge", { callId, hasAgent: Boolean(agent), hasSession: Boolean(session) });
    return;
  }

  const promptOverride = (session.metadata as { prompt_override?: string }).prompt_override?.trim();
  const bridgeConfig = promptOverride
    ? { ...agent.config, prompt: promptOverride }
    : agent.config;

  const sessionMeta = session.metadata as unknown as Record<string, unknown>;

  if (session.metadata.voicemail_detected || session.metadata.agent_skipped) {
    return;
  }

  // Campaña premium: tras AMD humano conectar ElevenLabs (buzón nunca activa la IA).
  if (
    bridgeConfig.voice_provider === "elevenlabs" &&
    sessionMeta.el_deferred_amd === true &&
    sessionMeta.campaign_outbound === true &&
    !sessionMeta.el_connected
  ) {
    const db = adminClient();
    const { data: agentRow } = await db
      .from("voice_agents")
      .select("elevenlabs_agent_id")
      .eq("id", ctx.agent.id)
      .maybeSingle();
    const elevenlabsAgentId = agentRow?.elevenlabs_agent_id?.trim();
    if (!elevenlabsAgentId) {
      console.warn("[telnyx:voice] campaña premium sin elevenlabs_agent_id", { callId });
      return;
    }

    try {
      await connectCampaignElevenLabsAfterAmd({
        screeningCallControlId: callId,
        session,
        agent,
        phoneNumberId: String(sessionMeta.phone_number_id ?? ctx.phone.id),
        elevenlabsAgentId,
      });
      await updatePhoneTestCallSession(callId, {
        phase: "dialing",
        answered_at: new Date().toISOString(),
        amd_pending: false,
        status_label: "Campaña — Conectando agente premium",
      });
    } catch (e) {
      console.error("[telnyx:voice] connectCampaignElevenLabsAfterAmd:", e);
      await updatePhoneTestCallSession(callId, {
        phase: "failed",
        error: e instanceof Error ? e.message : "No se pudo conectar agente premium",
        status_label: labelForPhase("failed"),
      });
    }
    return;
  }

  // ElevenLabs con SIP directo (sin AMD diferido). Saltar bridge Pipecat.
  if (bridgeConfig.voice_provider === "elevenlabs") {
    console.info("[telnyx:voice] agente ElevenLabs — bridge omitido (voz via SIP)", { callId });
    return;
  }

  const pendingSession = {
    callControlId: callId,
    callRecordId: session.id,
    userId: ctx.phone.user_id,
    voiceAgentId: ctx.agent.id,
    from: ctx.phone.e164,
    to: ctx.destinationE164,
    agentName: agent.agentName,
    config: bridgeConfig,
    companyContextText: agent.companyContextText,
    companyName: agent.companyName,
    preparedAt: Date.now()
  };

  setPendingBridgeSession(pendingSession);

  await updatePhoneTestCallSession(callId, {
    phase: "answered",
    last_event: "call.answered",
    status_label: labelForPhase("answered"),
    amd_pending: false,
  });

  try {
    const streamUrl = telnyxStreamUrl();
    console.info("[telnyx:voice] iniciando media stream", { callId, streamUrl });
    await telnyxStartMediaStream(callId, streamUrl);
  } catch (e) {
    console.error("[telnyx:voice] streaming_start error:", e);
    const greeting = agentGreeting(ctx.agent.name, ctx.agent.prompt);
    await updatePhoneTestCallSession(callId, {
      phase: "speaking",
      last_event: "streaming_start.fallback_tts",
      greeting,
      error: e instanceof Error ? e.message : "Stream falló — usando TTS",
      status_label: labelForPhase("speaking")
    });
    try {
      await speakText(callId, greeting);
    } catch (speakErr) {
      console.error("[telnyx:voice] fallback speak error:", speakErr);
      await updatePhoneTestCallSession(callId, {
        phase: "failed",
        last_event: "speak.error",
        error: speakErr instanceof Error ? speakErr.message : "Audio no disponible",
        status_label: labelForPhase("failed")
      });
    }
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
  const session = testCall ? await getPhoneTestCallSession(callId) : null;
  const outboundKind = session?.metadata
    ? managedOutboundKind(session.metadata as unknown as Record<string, unknown>)
    : "test";
  const phaseLabel = (phase: PhoneTestCallPhase) =>
    labelForManagedOutboundPhase(phase, outboundKind);

  const phaseByEvent: Record<string, PhoneTestCallPhase> = {
    "call.initiated": isOutbound(direction) || testCall ? "ringing" : "dialing",
    "call.ringing": "ringing",
    "call.speak.started": "speaking",
    "call.speak.ended": "connected",
    "call.hangup": "ended"
  };

  // Si ElevenLabs ya tomó la conversación (en otra pierna SIP), los eventos de la
  // pierna Telnyx de sondeo NO deben tocar el registro: si lo marcan "ended" el
  // sondeo (que solo mira in_progress) nunca lo finaliza y se pierde la grabación.
  const sessionMetaEarly = session?.metadata as unknown as Record<string, unknown> | undefined;
  const isScreeningLegPostEl =
    Boolean(sessionMetaEarly?.el_connected) &&
    String(sessionMetaEarly?.screening_call_id ?? "") === callId;

  if (testCall && phaseByEvent[eventType] && !isScreeningLegPostEl) {
    await updatePhoneTestCallSession(callId, {
      phase: phaseByEvent[eventType],
      last_event: eventType,
      status_label: phaseLabel(phaseByEvent[eventType])
    });
  }

  if (eventType === "call.hangup") {
    clearAmdFallback(callId);
    const row = testCall ? await getPhoneTestCallSession(callId) : null;
    if (row) {
      const rowMeta = row.metadata as unknown as Record<string, unknown>;
      if (
        rowMeta.el_connected &&
        String(rowMeta.screening_call_id ?? "") === callId
      ) {
        // Pierna Telnyx de verificación colgada tras conectar ElevenLabs — la conversación sigue activa.
        console.info("[telnyx:voice] hangup pierna screening post-EL", { callId });
        return NextResponse.json({ ok: true });
      }

      if (!row.metadata.finalized && !row.metadata.answered_at && !row.metadata.amd_pending) {
        const cause = String(payload.hangup_cause ?? payload.sip_hangup_cause ?? "");
        const outcome = mapHangupCauseToOutcome(cause);
        await finalizeOutboundShortCall({
          callControlId: callId,
          outcome,
          disconnectReason: cause || "No contestada",
        });
      } else if (!row.metadata.finalized && row.metadata.amd_pending && !row.metadata.answered_at) {
        // Contestó la red pero AMD no terminó (cuelgue abrupto) — tratar como buzón/no conexión.
        await finalizeOutboundShortCall({
          callControlId: callId,
          outcome: row.metadata.voicemail_detected ? "voicemail" : "no_answer",
          disconnectReason: String(payload.hangup_cause ?? "Colgó durante verificación"),
          amdResult: row.metadata.amd_result,
        });
      } else if (!row.metadata.finalized && row.metadata.voicemail_detected) {
        // Ya manejado por AMD; noop.
      } else {
        try {
          await closeActiveBridge(callId, "Phone Hangup");
        } catch (e) {
          console.error("[telnyx:voice] closeActiveBridge error:", e);
        }
        // Respaldo retardado: evita pisar el finalize del puente WS (con transcripción).
        setTimeout(() => {
          void (async () => {
            const fresh = await getPhoneTestCallSession(callId);
            if (!fresh || fresh.metadata.finalized) return;
            try {
              await finalizePhoneTestCall({
                callControlId: callId,
                transcript: [],
                disconnectReason: String(payload.hangup_cause ?? "Phone Hangup"),
              });
            } catch (e) {
              console.error("[telnyx:voice] finalize hangup (delayed) error:", e);
            }
          })();
        }, 10_000);
      }
    } else if (!isOutbound(direction)) {
      try {
        await finalizeInboundTelnyxCall(callId, payload);
      } catch (e) {
        console.error("[telnyx:voice] finalize inbound hangup error:", e);
      }
    }
  }

  if (
    eventType === "call.machine.detection.ended" ||
    eventType === "call.machine.premium.detection.ended"
  ) {
    const result = String(payload.result ?? "");
    if (result && testCall) {
      await handleAmdResult(callId, result, payload, from, to, direction);
    }
  }

  if (eventType === "call.answered" && (isOutbound(direction) || testCall)) {
    await updatePhoneTestCallSession(callId, {
      amd_pending: true,
      last_event: eventType,
      status_label:
        outboundKind === "campaign"
          ? "Campaña — Verificando buzón…"
          : outboundKind === "crm"
            ? "Llamada IA — Verificando buzón…"
            : "Prueba telefónica — Verificando buzón…",
    });
    scheduleAmdBridgeFallback(callId, payload, from, to, direction);
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
