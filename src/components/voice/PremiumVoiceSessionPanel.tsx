"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Loader2, Sparkles, RefreshCw, Wifi, WifiOff } from "lucide-react";
import {
  VoiceConversation,
  type DisconnectionDetails,
  type Status,
} from "@elevenlabs/client";
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
  isRecoverableDisconnect,
  logPremiumInternalIssue,
} from "@/lib/elevenlabs/disconnect-label";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import type { VoiceSessionPanelProps } from "@/components/voice/VoiceSessionPanel";

type SessionState = "idle" | "connecting" | "listening" | "speaking" | "reconnecting" | "unstable" | "error" | "ending";
type LinkQuality = "good" | "fair" | "poor";

interface TranscriptLine {
  role: "user" | "agent" | "system";
  text: string;
  time_sec: number;
}

const MAX_AUTO_RECONNECT = 2;
const RECONNECT_DELAY_MS = 1500;
const UNMOUNT_GRACE_MS = 400;

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
  const [linkQuality, setLinkQuality] = useState<LinkQuality>("good");
  const [reconnectCount, setReconnectCount] = useState(0);
  const [canManualReconnect, setCanManualReconnect] = useState(false);

  const conversationRef = useRef<VoiceConversation | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const transcriptLinesRef = useRef<TranscriptLine[]>([]);
  const sessionStartRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callSavedRef = useRef(false);
  const endingRef = useRef(false);
  const userEndedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const sessionEpochRef = useRef(0);
  const reconnectCountRef = useRef(0);
  const agentIdRef = useRef(agentId);
  const durationRef = useRef(0);
  const mutedRef = useRef(false);
  const errorStreakRef = useRef(0);
  const quotaBlockedRef = useRef(false);
  const lastDisconnectRef = useRef<DisconnectionDetails | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const connectSessionRef = useRef<(opts?: { isReconnect?: boolean }) => Promise<boolean>>(async () => false);

  useEffect(() => { agentIdRef.current = agentId; }, [agentId]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { reconnectCountRef.current = reconnectCount; }, [reconnectCount]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const active = ["listening", "speaking", "connecting", "reconnecting", "unstable"].includes(state);
    onCallStatusChange?.(active, duration);
  }, [state, duration, onCallStatusChange]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

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

  const updateLinkFromStatus = useCallback((status: Status) => {
    if (status === "connected") {
      setLinkQuality("good");
      errorStreakRef.current = 0;
    } else if (status === "connecting" || status === "disconnecting") {
      setLinkQuality("fair");
    }
  }, []);

  const saveCallRecord = useCallback(async (snapshot: {
    lines: TranscriptLine[];
    durationSec: number;
    disconnectReason?: string;
    disconnectDetails?: DisconnectionDetails | null;
    conversationId?: string | null;
  }) => {
    const id = agentIdRef.current;
    if (!id || callSavedRef.current) return false;
    const contentLines = snapshot.lines.filter(l => l.role !== "system");
    if (snapshot.durationSec < 1 && contentLines.length === 0) return false;

    callSavedRef.current = true;
    try {
      const token = await getAuthToken();
      if (!token) {
        setError("Sesión no válida. Inicia sesión de nuevo.");
        callSavedRef.current = false;
        return false;
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
          disconnect_reason: snapshot.disconnectReason
            ?? (userEndedRef.current ? "User Ended" : "Connection Ended"),
          status_label: quotaHit ? "Ended - Interrupción" : undefined,
          transcript: contentLines.map(({ role, text, time_sec }) => ({
            role: role === "system" ? "agent" : role,
            text,
            time_sec,
          })),
          metadata: {
            source: "web_test",
            voice_provider: "elevenlabs",
            conversation_id: snapshot.conversationId ?? conversationIdRef.current,
            reconnect_attempts: reconnectCountRef.current,
            quota_exceeded: quotaHit,
            disconnect_reason_detail: disconnectDetailText(snapshot.disconnectDetails),
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        callSavedRef.current = false;
        setError(data.error || "No se pudo guardar la llamada.");
        return false;
      }
      onCallSaved?.();
      return true;
    } catch {
      callSavedRef.current = false;
      setError("Error de red al guardar la llamada.");
      return false;
    }
  }, [onCallSaved]);

  const hardStopAudio = useCallback(async () => {
    clearReconnectTimer();
    const conv = conversationRef.current;
    conversationRef.current = null;
    if (!conv) return;
    try {
      conv.setVolume({ volume: 0 });
    } catch {
      /* ignore */
    }
    try {
      await conv.endSession();
    } catch {
      /* ignore */
    }
  }, [clearReconnectTimer]);

  const teardownConversation = useCallback(async () => {
    await hardStopAudio();
  }, [hardStopAudio]);

  const resetUi = useCallback(() => {
    stopTimer();
    sessionStartRef.current = null;
    setState("idle");
    setDuration(0);
    setStatusHint("");
    setMuted(false);
    setLinkQuality("good");
    setReconnectCount(0);
    reconnectCountRef.current = 0;
    setCanManualReconnect(false);
    errorStreakRef.current = 0;
    quotaBlockedRef.current = false;
    lastDisconnectRef.current = null;
    conversationIdRef.current = null;
    userEndedRef.current = false;
  }, [stopTimer]);

  const persistSnapshot = useCallback(async (opts?: {
    disconnectReason?: string;
    disconnectDetails?: DisconnectionDetails | null;
    conversationId?: string | null;
  }) => {
    await saveCallRecord({
      lines: [...transcriptLinesRef.current],
      durationSec: durationRef.current,
      disconnectReason: opts?.disconnectReason,
      disconnectDetails: opts?.disconnectDetails ?? lastDisconnectRef.current,
      conversationId: opts?.conversationId ?? conversationIdRef.current,
    });
  }, [saveCallRecord]);

  const finalizeSession = useCallback(async (opts?: { navigateAway?: boolean; keepTranscript?: boolean }) => {
    if (endingRef.current) return;
    endingRef.current = true;
    clearReconnectTimer();
    setState("ending");
    setStatusHint("Finalizando sesión...");

    await hardStopAudio();
    sessionEpochRef.current += 1;

    const convId = conversationIdRef.current;
    if (convId) {
      await new Promise(r => setTimeout(r, 2000));
    }

    const snapshot = {
      lines: [...transcriptLinesRef.current],
      durationSec: durationRef.current,
      disconnectReason: userEndedRef.current ? "User Ended" : "Connection Ended",
      disconnectDetails: lastDisconnectRef.current,
      conversationId: convId,
    };
    const saved = await saveCallRecord(snapshot);

    if (!opts?.keepTranscript) {
      transcriptLinesRef.current = [];
      setTranscript([]);
    }
    resetUi();
    endingRef.current = false;

    if (opts?.navigateAway && (saved || (snapshot.durationSec < 1 && snapshot.lines.length === 0))) {
      onEndCall?.();
    }
  }, [clearReconnectTimer, hardStopAudio, onEndCall, resetUi, saveCallRecord]);

  const handleDisconnect = useCallback(async (details: DisconnectionDetails, epoch: number) => {
    conversationRef.current = null;
    lastDisconnectRef.current = details;
    const quotaHit = isQuotaDisconnect(details);
    if (quotaHit) quotaBlockedRef.current = true;

    const recoverable = !quotaHit && isRecoverableDisconnect(details);
    const label = describePremiumDisconnect(details);

    if (details.reason === "user") {
      userEndedRef.current = true;
      await finalizeSession({ navigateAway: true });
      return;
    }

    if (recoverable && reconnectCountRef.current < MAX_AUTO_RECONNECT && !userEndedRef.current) {
      const attempt = reconnectCountRef.current + 1;
      reconnectCountRef.current = attempt;
      setReconnectCount(attempt);
      setState("reconnecting");
      setStatusHint(`Reconectando (${attempt}/${MAX_AUTO_RECONNECT})...`);
      appendTranscript("system", "Reconectando…");

      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        if (epoch !== sessionEpochRef.current || userEndedRef.current) return;
        void connectSessionRef.current({ isReconnect: true });
      }, RECONNECT_DELAY_MS);
      return;
    }

    setState("error");
    setError(label);
    setCanManualReconnect(recoverable && !quotaHit);
    setLinkQuality("poor");
    appendTranscript("system", label);
    sessionEpochRef.current += 1;
    clearReconnectTimer();
    await persistSnapshot({
      disconnectReason: quotaHit ? "Service Unavailable" : "Connection Ended",
      disconnectDetails: details,
    });
  }, [appendTranscript, clearReconnectTimer, finalizeSession, persistSnapshot]);

  const connectSession = useCallback(async (opts?: { isReconnect?: boolean }) => {
    const id = agentIdRef.current;
    if (!id || endingRef.current || quotaBlockedRef.current) return false;

    const epoch = ++sessionEpochRef.current;
    setError("");
    setCanManualReconnect(false);
    setState(opts?.isReconnect ? "reconnecting" : "connecting");
    setStatusHint(opts?.isReconnect ? "Restableciendo conexión..." : "Preparando sesión...");
    setLinkQuality("fair");

    try {
      if (!opts?.isReconnect) {
        await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }

      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/voice/agents/elevenlabs/session?voice_agent_id=${encodeURIComponent(id)}`,
        { headers }
      );
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 || res.status === 503 || data.code === "premium_unavailable") {
          quotaBlockedRef.current = true;
          logPremiumInternalIssue("session_api", { status: res.status, code: data.code, detail: data.error });
          throw new Error(PREMIUM_USER_MESSAGES.temporarilyUnavailable);
        }
        logPremiumInternalIssue("session_api", { status: res.status, detail: data.error });
        throw new Error(PREMIUM_USER_MESSAGES.sessionStartFailed);
      }
      if (epoch !== sessionEpochRef.current || !mountedRef.current) return false;

      setStatusHint("Conectando audio en tiempo real...");

      const sessionOptions = {
        ...(data.conversationToken
          ? { conversationToken: data.conversationToken as string }
          : { signedUrl: data.signedUrl as string }),
        onConnect: ({ conversationId }: { conversationId: string }) => {
          if (epoch !== sessionEpochRef.current) return;
          if (conversationId) conversationIdRef.current = conversationId;
          startTimer();
          setState("listening");
          setStatusHint("");
          setLinkQuality("good");
          errorStreakRef.current = 0;
          if (opts?.isReconnect) {
            appendTranscript("system", "Conexión restablecida.");
          }
        },
        onDisconnect: (details: DisconnectionDetails) => {
          if (epoch !== sessionEpochRef.current || userEndedRef.current) return;
          logPremiumInternalIssue("disconnect", {
            reason: details.reason,
            detail: disconnectDetailText(details),
          });
          void handleDisconnect(details, epoch);
        },
        onError: (message: string) => {
          if (epoch !== sessionEpochRef.current) return;
          logPremiumInternalIssue("sdk_error", { message });
          if (isQuotaOrBillingError(message)) {
            quotaBlockedRef.current = true;
            setError(PREMIUM_USER_MESSAGES.temporarilyUnavailable);
            setState("error");
            setCanManualReconnect(false);
            setLinkQuality("poor");
            sessionEpochRef.current += 1;
            void persistSnapshot({
              disconnectReason: "Service Unavailable",
              disconnectDetails: null,
            });
            return;
          }
          errorStreakRef.current += 1;
          if (errorStreakRef.current >= 2) {
            setLinkQuality("poor");
            setState(prev => (prev === "speaking" || prev === "listening" ? "unstable" : prev));
          }
        },
        onMessage: ({ message, role }: { message: string; role: "user" | "agent" }) => {
          if (epoch !== sessionEpochRef.current || userEndedRef.current) return;
          appendTranscript(role, message);
        },
        onModeChange: ({ mode }: { mode: "speaking" | "listening" }) => {
          if (epoch !== sessionEpochRef.current) return;
          setState(mode === "speaking" ? "speaking" : "listening");
        },
        onStatusChange: ({ status }: { status: Status }) => {
          if (epoch !== sessionEpochRef.current) return;
          updateLinkFromStatus(status);
        },
        onInterruption: () => {
          if (epoch !== sessionEpochRef.current) return;
          setStatusHint("Interrupción detectada — sigue hablando con naturalidad.");
          window.setTimeout(() => {
            if (epoch === sessionEpochRef.current) setStatusHint("");
          }, 2500);
        },
      };

      await hardStopAudio();
      const conversation = await VoiceConversation.startSession(sessionOptions);
      if (epoch !== sessionEpochRef.current) {
        try {
          await conversation.endSession();
        } catch {
          /* stale session */
        }
        return false;
      }

      conversationRef.current = conversation;
      conversation.setMicMuted(mutedRef.current);
      return true;
    } catch (err) {
      if (epoch !== sessionEpochRef.current) return false;
      const internal = err instanceof Error ? err.message : String(err);
      const quotaHit = isQuotaOrBillingError(internal) || quotaBlockedRef.current;
      if (quotaHit) quotaBlockedRef.current = true;
      logPremiumInternalIssue("connect_failed", { error: internal, quotaHit });
      setError(
        quotaHit
          ? PREMIUM_USER_MESSAGES.temporarilyUnavailable
          : describePremiumErrorMessage(internal)
      );
      setState("error");
      setCanManualReconnect(!quotaHit);
      if (quotaHit) {
        void persistSnapshot({
          disconnectReason: "Service Unavailable",
          disconnectDetails: null,
        });
      }
      return false;
    }
  }, [appendTranscript, handleDisconnect, hardStopAudio, persistSnapshot, startTimer, updateLinkFromStatus]);

  useEffect(() => {
    connectSessionRef.current = connectSession;
  }, [connectSession]);

  const startSession = useCallback(async () => {
    userEndedRef.current = false;
    callSavedRef.current = false;
    quotaBlockedRef.current = false;
    lastDisconnectRef.current = null;
    conversationIdRef.current = null;
    transcriptLinesRef.current = [];
    setTranscript([]);
    setReconnectCount(0);
    reconnectCountRef.current = 0;
    await connectSession({ isReconnect: false });
  }, [connectSession]);

  const stopSession = useCallback(async () => {
    if (endingRef.current) return;
    userEndedRef.current = true;
    await finalizeSession({ navigateAway: true });
  }, [finalizeSession]);

  const manualReconnect = useCallback(async () => {
    setError("");
    setReconnectCount(0);
    reconnectCountRef.current = 0;
    userEndedRef.current = false;
    await connectSession({ isReconnect: true });
  }, [connectSession]);

  const dismissError = useCallback(async () => {
    sessionEpochRef.current += 1;
    await hardStopAudio();
    await persistSnapshot({ disconnectReason: "User Dismissed Error" });
    setError("");
    setState("idle");
    setCanManualReconnect(false);
    quotaBlockedRef.current = false;
  }, [hardStopAudio, persistSnapshot]);

  useEffect(() => {
    return () => {
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = setTimeout(() => {
        if (!mountedRef.current && conversationRef.current) {
          sessionEpochRef.current += 1;
          void conversationRef.current.endSession().catch(() => {});
          conversationRef.current = null;
        }
      }, UNMOUNT_GRACE_MS);
      stopTimer();
      clearReconnectTimer();
    };
  }, [clearReconnectTimer, stopTimer]);

  useEffect(() => {
    return () => {
      if (unmountTimerRef.current) {
        clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const conv = conversationRef.current;
    if (!conv || state === "idle" || state === "error" || state === "connecting") return;
    conv.setMicMuted(muted);
  }, [muted, state]);

  const isActive = state === "listening" || state === "speaking" || state === "unstable";
  const isConnecting = state === "connecting" || state === "reconnecting" || state === "ending";
  const statusLabel =
    state === "idle" ? "Lista para iniciar" :
    state === "connecting" ? (statusHint || "Conectando...") :
    state === "reconnecting" ? (statusHint || "Reconectando...") :
    state === "ending" ? (statusHint || "Finalizando...") :
    state === "unstable" ? "Conexión inestable" :
    state === "listening" ? "Escuchando" :
    state === "speaking" ? "Hablando" : "Desconectado";

  const qualityLabel =
    linkQuality === "good" ? "Conexión estable" :
    linkQuality === "fair" ? "Sincronizando..." : "Señal débil";

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
                isActive && linkQuality === "good" ? "bg-emerald-400 animate-pulse" :
                isConnecting ? "bg-amber-400 animate-pulse" :
                linkQuality === "poor" || state === "error" ? "bg-red-400" :
                state === "unstable" ? "bg-amber-400 animate-pulse" : "bg-gray-500"
              }`} />
              <span className="text-[11px] text-gray-400">{statusLabel}</span>
            </div>
            {(isActive || isConnecting) && (
              <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-gray-500">
                {linkQuality === "poor" ? (
                  <WifiOff className="w-3 h-3 text-amber-400" />
                ) : (
                  <Wifi className="w-3 h-3 text-emerald-400/80" />
                )}
                {qualityLabel}
              </div>
            )}
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
                  onClick={() => void (state === "error" && canManualReconnect ? manualReconnect() : startSession())}
                  disabled={!ready || !agentId}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold ${btnPrimary} disabled:opacity-50`}
                >
                  {state === "error" && canManualReconnect ? (
                    <><RefreshCw className="w-4 h-4" /> Reconectar</>
                  ) : (
                    <><Mic className="w-4 h-4" /> Iniciar sesión</>
                  )}
                </button>
                {state === "error" && (
                  <button
                    onClick={() => void dismissError()}
                    className={`w-full ${btnGhost} text-xs`}
                  >
                    Cerrar sin reconectar
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
                  onClick={() => void stopSession()}
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
                Conexión directa en tiempo real con voz premium. Usa auriculares para mejor calidad.
              </p>
            </div>
          ) : (
            transcript.map((line, i) => (
              <div
                key={i}
                className={`flex ${
                  line.role === "user" ? "justify-end" :
                  line.role === "system" ? "justify-center" : "justify-start"
                }`}
              >
                <div className={`max-w-[82%] px-4 py-3 rounded-2xl text-[13px] ${
                  line.role === "user"
                    ? "bg-[#5b5bf6]/15 border border-[#5b5bf6]/20 text-gray-100"
                    : line.role === "system"
                      ? "bg-amber-500/[.06] border border-amber-500/15 text-amber-200/90 text-[11px]"
                      : "bg-white/[.03] border border-white/[.07] text-gray-200"
                }`}>
                  {line.role !== "system" && (
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 text-gray-500">
                      {line.role === "user" ? "Tú" : agentName}
                    </p>
                  )}
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
