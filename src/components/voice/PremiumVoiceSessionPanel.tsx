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
import { describePremiumDisconnect, isRecoverableDisconnect } from "@/lib/elevenlabs/disconnect-label";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import type { VoiceSessionPanelProps } from "@/components/voice/VoiceSessionPanel";

type SessionState = "idle" | "connecting" | "listening" | "speaking" | "reconnecting" | "unstable" | "error";
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

      const res = await fetch("/api/voice/agents/calls", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          voice_agent_id: id,
          phone_number: "Prueba web premium",
          duration_sec: snapshot.durationSec,
          disconnect_reason: userEndedRef.current ? "User Ended" : "Connection Ended",
          transcript: contentLines.map(({ role, text, time_sec }) => ({
            role: role === "system" ? "agent" : role,
            text,
            time_sec,
          })),
          metadata: { source: "web_test", voice_provider: "elevenlabs" },
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

  const teardownConversation = useCallback(async (endRemote: boolean) => {
    clearReconnectTimer();
    const conv = conversationRef.current;
    conversationRef.current = null;
    if (conv && endRemote) {
      try {
        await conv.endSession();
      } catch {
        /* ignore */
      }
    }
  }, [clearReconnectTimer]);

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
    userEndedRef.current = false;
  }, [stopTimer]);

  const finalizeSession = useCallback(async (opts?: { navigateAway?: boolean; keepTranscript?: boolean }) => {
    if (endingRef.current) return;
    endingRef.current = true;
    clearReconnectTimer();

    await teardownConversation(!userEndedRef.current);

    const snapshot = {
      lines: [...transcriptLinesRef.current],
      durationSec: durationRef.current,
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
  }, [clearReconnectTimer, onEndCall, resetUi, saveCallRecord, teardownConversation]);

  const handleDisconnect = useCallback(async (details: DisconnectionDetails, epoch: number) => {
    conversationRef.current = null;
    const recoverable = isRecoverableDisconnect(details);
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
      appendTranscript("system", `Conexión inestable. Reintentando (${attempt}/${MAX_AUTO_RECONNECT})...`);

      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        if (epoch !== sessionEpochRef.current || userEndedRef.current) return;
        void connectSessionRef.current({ isReconnect: true });
      }, RECONNECT_DELAY_MS);
      return;
    }

    setState("error");
    setError(label);
    setCanManualReconnect(recoverable);
    setLinkQuality("poor");
    appendTranscript("system", label);
  }, [appendTranscript, clearReconnectTimer, finalizeSession]);

  const connectSession = useCallback(async (opts?: { isReconnect?: boolean }) => {
    const id = agentIdRef.current;
    if (!id || endingRef.current) return false;

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
      if (!res.ok) throw new Error(data.error || "No se pudo iniciar la sesión premium");
      if (epoch !== sessionEpochRef.current || !mountedRef.current) return false;

      setStatusHint("Conectando audio en tiempo real...");

      const sessionOptions = {
        ...(data.conversationToken
          ? { conversationToken: data.conversationToken as string }
          : { signedUrl: data.signedUrl as string }),
        onConnect: () => {
          if (epoch !== sessionEpochRef.current) return;
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
          void handleDisconnect(details, epoch);
        },
        onError: (message: string) => {
          if (epoch !== sessionEpochRef.current) return;
          errorStreakRef.current += 1;
          if (errorStreakRef.current >= 2) {
            setLinkQuality("poor");
            setState(prev => (prev === "speaking" || prev === "listening" ? "unstable" : prev));
          }
          console.warn("[premium-voice]", message);
        },
        onMessage: ({ message, role }: { message: string; role: "user" | "agent" }) => {
          if (epoch !== sessionEpochRef.current) return;
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

      await teardownConversation(true);
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
      const message = err instanceof Error ? err.message : "No se pudo conectar";
      setError(message);
      setState("error");
      setCanManualReconnect(true);
      return false;
    }
  }, [appendTranscript, handleDisconnect, startTimer, teardownConversation, updateLinkFromStatus]);

  useEffect(() => {
    connectSessionRef.current = connectSession;
  }, [connectSession]);

  const startSession = useCallback(async () => {
    userEndedRef.current = false;
    callSavedRef.current = false;
    transcriptLinesRef.current = [];
    setTranscript([]);
    setReconnectCount(0);
    reconnectCountRef.current = 0;
    await connectSession({ isReconnect: false });
  }, [connectSession]);

  const stopSession = useCallback(async () => {
    userEndedRef.current = true;
    sessionEpochRef.current += 1;
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
    clearReconnectTimer();
    await teardownConversation(true);
    setError("");
    setState("idle");
    setCanManualReconnect(false);
  }, [clearReconnectTimer, teardownConversation]);

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
  const isConnecting = state === "connecting" || state === "reconnecting";
  const statusLabel =
    state === "idle" ? "Lista para iniciar" :
    state === "connecting" ? (statusHint || "Conectando...") :
    state === "reconnecting" ? (statusHint || "Reconectando...") :
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
                Conexión directa en tiempo real. Si se corta, reintentamos automáticamente hasta 2 veces.
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
