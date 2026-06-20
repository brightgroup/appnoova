"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { VoiceConversation, type DisconnectionDetails } from "@elevenlabs/client";
import { getTemplateMeta } from "@/lib/voice-agent-templates";
import { agentAvatarGradient, agentAvatarStyle } from "@/lib/voice-agent-display";
import { getAuthHeaders, getAuthToken } from "@/lib/voice-agents-api";
import {
  PREMIUM_USER_MESSAGES,
  describePremiumDisconnect,
  describePremiumErrorMessage,
  disconnectDetailText,
  isQuotaOrBillingError,
  isQuotaDisconnect,
  logPremiumInternalIssue,
} from "@/lib/elevenlabs/disconnect-label";
import {
  fetchPremiumWebSession,
  premiumDisconnectReason,
} from "@/lib/elevenlabs/premium-web-session";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import { isGoodbyeUtterance } from "@/lib/voice-goodbye-detection";
import type { VoiceSessionPanelProps } from "@/components/voice/VoiceSessionPanel";

type SessionState = "idle" | "connecting" | "listening" | "speaking" | "ending" | "error";

interface TranscriptLine {
  role: "user" | "agent";
  text: string;
  time_sec: number;
}

export function PremiumVoiceSessionPanel({
  sourceTemplate,
  agentId,
  agentConfig,
  ready = true,
  onEndCall,
  onCallSaved,
  onCallStatusChange,
}: VoiceSessionPanelProps) {
  const meta = getTemplateMeta(sourceTemplate);
  const avatarGradient = agentAvatarGradient(agentConfig.color || meta.color);
  const avatarStyle = agentAvatarStyle(agentConfig.color || meta.color);
  const agentName = agentConfig.name?.trim() || "Agente";
  const agentInitial = agentName.charAt(0).toUpperCase() || "A";

  const [state, setState] = useState<SessionState>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [duration, setDuration] = useState(0);
  const [statusHint, setStatusHint] = useState("");

  const conversationRef = useRef<VoiceConversation | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const transcriptLinesRef = useRef<TranscriptLine[]>([]);
  const sessionStartRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callSavedRef = useRef(false);
  const endingRef = useRef(false);
  const userEndedRef = useRef(false);
  const sessionEpochRef = useRef(0);
  const agentIdRef = useRef(agentId);
  const durationRef = useRef(0);
  const mutedRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const lastDisconnectRef = useRef<DisconnectionDetails | null>(null);
  const goodbyeTriggeredRef = useRef(false);
  const autoHangupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { agentIdRef.current = agentId; }, [agentId]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    const active = state === "listening" || state === "speaking" || state === "connecting";
    onCallStatusChange?.(active, duration);
  }, [state, duration, onCallStatusChange]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    if (sessionStartRef.current) return;
    sessionStartRef.current = Date.now();
    stopTimer();
    timerRef.current = setInterval(() => {
      if (!sessionStartRef.current) return;
      setDuration(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
  }, [stopTimer]);

  const appendTranscript = useCallback((role: TranscriptLine["role"], text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const start = sessionStartRef.current ?? Date.now();
    const line: TranscriptLine = {
      role,
      text: trimmed,
      time_sec: Math.max(0, Math.floor((Date.now() - start) / 1000)),
    };
    transcriptLinesRef.current = [...transcriptLinesRef.current, line];
    setTranscript(prev => [...prev, line]);
  }, []);

  const saveCallRecord = useCallback(async (snapshot: {
    lines: TranscriptLine[];
    durationSec: number;
    disconnectReason: string;
    disconnectDetails?: DisconnectionDetails | null;
    conversationId?: string | null;
  }) => {
    const id = agentIdRef.current;
    if (!id || callSavedRef.current) return;
    if (snapshot.durationSec < 1 && snapshot.lines.length === 0) return;

    callSavedRef.current = true;
    try {
      const token = await getAuthToken();
      if (!token) {
        callSavedRef.current = false;
        setError("Sesión no válida. Inicia sesión de nuevo.");
        return;
      }

      const quotaHit = snapshot.disconnectDetails
        ? isQuotaDisconnect(snapshot.disconnectDetails)
        : false;

      const res = await fetch("/api/voice/agents/calls", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          voice_agent_id: id,
          phone_number: "Prueba web premium",
          duration_sec: snapshot.durationSec,
          disconnect_reason: snapshot.disconnectReason,
          status_label: quotaHit ? "Ended - Interrupción" : undefined,
          transcript: snapshot.lines.map(({ role, text, time_sec }) => ({ role, text, time_sec })),
          metadata: {
            source: "web_test",
            voice_provider: "elevenlabs",
            conversation_id: snapshot.conversationId ?? conversationIdRef.current,
            quota_exceeded: quotaHit,
            disconnect_reason_detail: disconnectDetailText(snapshot.disconnectDetails),
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        callSavedRef.current = false;
        setError(data.error || "No se pudo guardar la llamada.");
        return;
      }
      onCallSaved?.();
    } catch {
      callSavedRef.current = false;
      setError("Error de red al guardar la llamada.");
    }
  }, [onCallSaved]);

  const persistSnapshot = useCallback((disconnectReason: string) => {
    void saveCallRecord({
      lines: [...transcriptLinesRef.current],
      durationSec: durationRef.current,
      disconnectReason,
      disconnectDetails: lastDisconnectRef.current,
      conversationId: conversationIdRef.current,
    });
  }, [saveCallRecord]);

  const resetSessionState = useCallback(() => {
    stopTimer();
    sessionStartRef.current = null;
    conversationRef.current = null;
    conversationIdRef.current = null;
    lastDisconnectRef.current = null;
    userEndedRef.current = false;
    goodbyeTriggeredRef.current = false;
    if (autoHangupTimerRef.current) clearTimeout(autoHangupTimerRef.current);
    autoHangupTimerRef.current = null;
    setDuration(0);
    setMuted(false);
    setStatusHint("");
    setState("idle");
  }, [stopTimer]);

  const endConversation = useCallback(async () => {
    const conv = conversationRef.current;
    conversationRef.current = null;
    if (!conv) return;
    try {
      await conv.endSession();
    } catch {
      /* ignore */
    }
  }, []);

  const finishSession = useCallback((opts?: { navigateAway?: boolean; clearTranscript?: boolean }) => {
    if (endingRef.current) return;
    endingRef.current = true;
    sessionEpochRef.current += 1;
    setState("ending");

    void endConversation().finally(() => {
      const reason = premiumDisconnectReason(
        lastDisconnectRef.current ?? { reason: "user" },
        userEndedRef.current
      );
      persistSnapshot(reason);

      if (opts?.clearTranscript !== false) {
        transcriptLinesRef.current = [];
        setTranscript([]);
      }
      resetSessionState();
      endingRef.current = false;

      if (opts?.navigateAway) onEndCall?.();
    });
  }, [endConversation, onEndCall, persistSnapshot, resetSessionState]);

  const scheduleAutoHangup = useCallback((role: "user" | "agent") => {
    if (goodbyeTriggeredRef.current || userEndedRef.current || endingRef.current) return;
    goodbyeTriggeredRef.current = true;
    setStatusHint(
      role === "user"
        ? "Despedida detectada · Colgando..."
        : `${agentName} se despidió · Colgando...`
    );
    if (autoHangupTimerRef.current) clearTimeout(autoHangupTimerRef.current);
    autoHangupTimerRef.current = setTimeout(() => {
      userEndedRef.current = true;
      finishSession({ navigateAway: true });
    }, role === "agent" ? 2200 : 2800);
  }, [agentName, finishSession]);

  const handleDisconnect = useCallback((details: DisconnectionDetails, epoch: number) => {
    if (epoch !== sessionEpochRef.current || userEndedRef.current) return;
    conversationRef.current = null;
    lastDisconnectRef.current = details;
    sessionEpochRef.current += 1;

    if (details.reason !== "user") {
      const label = describePremiumDisconnect(details);
      setError(label);
      setState("error");
      persistSnapshot(
        isQuotaDisconnect(details) ? "Service Unavailable" : premiumDisconnectReason(details, false)
      );
    } else {
      finishSession({ navigateAway: true });
    }
  }, [finishSession, persistSnapshot]);

  const startSession = useCallback(async () => {
    const id = agentIdRef.current;
    if (!id || endingRef.current) return;

    sessionEpochRef.current += 1;
    const epoch = sessionEpochRef.current;

    userEndedRef.current = false;
    callSavedRef.current = false;
    goodbyeTriggeredRef.current = false;
    lastDisconnectRef.current = null;
    conversationIdRef.current = null;
    transcriptLinesRef.current = [];
    setTranscript([]);
    setError("");
    setState("connecting");
    setStatusHint("Conectando...");

    try {
      const headers = await getAuthHeaders();
      const session = await fetchPremiumWebSession(id, headers);
      if (epoch !== sessionEpochRef.current) return;

      // Mismo patrón que el widget ElevenLabs: token WebRTC + variables dinámicas.
      const conversation = await VoiceConversation.startSession({
        conversationToken: session.conversationToken,
        connectionType: "webrtc",
        dynamicVariables: session.dynamicVariables,
        onConnect: ({ conversationId }) => {
          if (epoch !== sessionEpochRef.current) return;
          if (conversationId) conversationIdRef.current = conversationId;
          startTimer();
          setState("listening");
          setStatusHint("");
        },
        onDisconnect: details => {
          if (epoch !== sessionEpochRef.current) return;
          logPremiumInternalIssue("disconnect", {
            reason: details.reason,
            detail: disconnectDetailText(details),
          });
          handleDisconnect(details, epoch);
        },
        onError: message => {
          if (epoch !== sessionEpochRef.current) return;
          logPremiumInternalIssue("sdk_error", { message });
          if (isQuotaOrBillingError(message)) {
            setError(PREMIUM_USER_MESSAGES.temporarilyUnavailable);
            setState("error");
            sessionEpochRef.current += 1;
            persistSnapshot("Service Unavailable");
          }
        },
        onMessage: ({ message, role }) => {
          if (epoch !== sessionEpochRef.current || userEndedRef.current) return;
          appendTranscript(role, message);
          if (!goodbyeTriggeredRef.current && isGoodbyeUtterance(message)) {
            scheduleAutoHangup(role);
          }
        },
        onModeChange: ({ mode }) => {
          if (epoch !== sessionEpochRef.current) return;
          setState(mode === "speaking" ? "speaking" : "listening");
        },
      });

      if (epoch !== sessionEpochRef.current) {
        try { await conversation.endSession(); } catch { /* stale */ }
        return;
      }

      conversationRef.current = conversation;
      conversation.setMicMuted(mutedRef.current);
    } catch (err) {
      if (epoch !== sessionEpochRef.current) return;
      const internal = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number }).status;
      const code = (err as { code?: string }).code;
      logPremiumInternalIssue("connect_failed", { error: internal, status, code });

      const quotaHit =
        status === 429
        || status === 503
        || code === "premium_unavailable"
        || isQuotaOrBillingError(internal);

      setError(
        quotaHit
          ? PREMIUM_USER_MESSAGES.temporarilyUnavailable
          : describePremiumErrorMessage(internal)
      );
      setState("error");
    }
  }, [appendTranscript, handleDisconnect, persistSnapshot, scheduleAutoHangup, startTimer]);

  const stopSession = useCallback(() => {
    if (endingRef.current) return;
    if (autoHangupTimerRef.current) clearTimeout(autoHangupTimerRef.current);
    userEndedRef.current = true;
    finishSession({ navigateAway: true });
  }, [finishSession]);

  useEffect(() => {
    const conv = conversationRef.current;
    if (!conv || state === "idle" || state === "error" || state === "connecting") return;
    conv.setMicMuted(muted);
  }, [muted, state]);

  useEffect(() => {
    return () => {
      stopTimer();
      if (autoHangupTimerRef.current) clearTimeout(autoHangupTimerRef.current);
      sessionEpochRef.current += 1;
      const conv = conversationRef.current;
      conversationRef.current = null;
      if (conv) void conv.endSession().catch(() => {});
    };
  }, [stopTimer]);

  const isActive = state === "listening" || state === "speaking";
  const isConnecting = state === "connecting" || state === "ending";
  const statusLabel =
    state === "idle" ? "Lista para iniciar" :
    state === "connecting" ? (statusHint || "Conectando...") :
    state === "ending" ? (statusHint || "Finalizando...") :
    state === "listening" ? "Escuchando" :
    state === "speaking" ? "Hablando" : "Desconectado";

  return (
    <div className="flex-1 flex min-h-0 p-4 gap-4 overflow-hidden">
      <aside className="w-[300px] shrink-0 flex flex-col gap-3">
        <div className="flex-1 rounded-2xl border border-white/[.10] bg-noova-surface p-5 flex flex-col min-h-[420px]">
          <div className="flex flex-col items-center text-center pb-5 border-b border-white/[.06]">
            <div className="relative mb-3">
              {isActive && (
                <div
                  className="absolute -inset-2 rounded-full opacity-70 blur-xl animate-pulse"
                  style={{ background: avatarGradient }}
                />
              )}
              <div
                className="relative w-[80px] h-[80px] rounded-full flex items-center justify-center border-2 border-white/35 ring-1 ring-white/15"
                style={avatarStyle}
              >
                <span className="text-[32px] font-bold text-white leading-none select-none drop-shadow-sm">
                  {agentInitial}
                </span>
              </div>
            </div>
            <p className="text-sm font-semibold text-white tracking-tight">{agentName}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25">
              <span className="text-[10px] text-amber-200/90 font-medium">Premium</span>
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[.04] border border-white/[.08]">
              <span className={`w-1.5 h-1.5 rounded-full ${
                isActive ? "bg-emerald-400 animate-pulse" :
                isConnecting ? "bg-amber-400 animate-pulse" :
                state === "error" ? "bg-red-400" : "bg-gray-500"
              }`} />
              <span className="text-[11px] text-gray-400">{statusLabel}</span>
            </div>
            {isActive && duration > 0 && (
              <p className="text-lg font-semibold text-white tabular-nums mt-3">
                {String(Math.floor(duration / 60)).padStart(2, "0")}:{String(duration % 60).padStart(2, "0")}
              </p>
            )}
          </div>

          <div className="pt-5 space-y-2.5 flex-1">
            {state === "idle" || state === "error" ? (
              <>
                <button
                  onClick={() => void startSession()}
                  disabled={!ready || !agentId}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold ${btnPrimary} disabled:opacity-50`}
                >
                  {state === "error" ? (
                    <><RefreshCw className="w-4 h-4" /> Reintentar</>
                  ) : (
                    <><Mic className="w-4 h-4" /> Iniciar sesión</>
                  )}
                </button>
                {state === "error" && (
                  <button
                    onClick={() => { setError(""); setState("idle"); }}
                    className={`w-full ${btnGhost} text-xs`}
                  >
                    Cerrar
                  </button>
                )}
              </>
            ) : isConnecting ? (
              <button disabled className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm text-gray-400 border border-white/[.08] cursor-not-allowed">
                <Loader2 className="w-4 h-4 animate-spin" /> {statusHint || "Conectando..."}
              </button>
            ) : (
              <>
                <button
                  onClick={() => setMuted(m => !m)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border ${
                    muted
                      ? "bg-red-500/[.08] border-red-500/25 text-red-400"
                      : "bg-white/[.03] border-white/[.08] text-gray-300"
                  }`}
                >
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {muted ? "Micrófono silenciado" : "Micrófono activo"}
                </button>
                <button
                  onClick={() => stopSession()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-red-500/[.08] border border-red-500/25 text-red-400"
                >
                  <PhoneOff className="w-4 h-4" /> Terminar sesión
                </button>
              </>
            )}
          </div>

          {error && (
            <div className="mt-3 p-3 rounded-xl bg-red-500/[.06] border border-red-500/20 text-[11px] text-red-400 leading-relaxed">
              {error}
            </div>
          )}

          {statusHint && isActive && (
            <p className="mt-3 text-[10px] text-gray-500 leading-relaxed text-center">{statusHint}</p>
          )}
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col rounded-2xl border border-white/[.10] bg-noova-surface overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[.06] flex items-center gap-2 shrink-0">
          <Sparkles className="w-4 h-4 text-amber-400/80" />
          <span className="text-xs font-semibold text-gray-300">Transcripción en vivo</span>
        </div>
        <div ref={transcriptRef} className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[360px]">
          {transcript.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <p className="text-sm text-gray-300">Sin conversación aún</p>
              <p className="text-xs text-gray-500 mt-2 max-w-xs">
                Conexión WebRTC directa con voz premium. Usa auriculares para mejor calidad.
              </p>
            </div>
          ) : (
            transcript.map((line, i) => (
              <div
                key={i}
                className={`flex ${line.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[82%] px-4 py-3 rounded-2xl text-[13px] ${
                  line.role === "user"
                    ? "bg-[#5b5bf6]/15 border border-[#5b5bf6]/20 text-gray-100"
                    : "bg-white/[.03] border border-white/[.07] text-gray-200"
                }`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 text-gray-500">
                    {line.role === "user" ? "Tú" : agentName}
                  </p>
                  {line.text}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
