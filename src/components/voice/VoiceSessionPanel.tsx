"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, PhoneOff, Loader2, RefreshCw, MessageSquare, Headphones } from "lucide-react";
import { GoogleGenAI, type Session, type LiveServerMessage } from "@google/genai";
import { DEFAULT_LIVE_MODEL } from "@/lib/voice-agent-options";
import { buildGeminiLiveSessionConfig } from "@/lib/gemini-live-config";
import { buildPhoneAgentSystemInstruction } from "@/lib/telephony/phone-agent-instruction";
import { buildVoiceKickoffMessage } from "@/lib/voice-accent-profile";
import { parsePcmRate, pcmBase64ToFloat32, resampleTo16kPcm } from "@/lib/voice-session-audio";
import { getAuthHeaders, getAuthToken } from "@/lib/voice-agents-api";
import { encodeWav, mergePcmBuffers, downsamplePcm } from "@/lib/call-recording";
import { blobToBase64, btnGhost } from "@/lib/brand-ui";
import { isGoodbyeUtterance } from "@/lib/voice-goodbye-detection";
import { PremiumVoiceAvatar } from "@/components/voice/PremiumVoiceAvatar";
import type { VoiceAgentFormData } from "@/types/voice-agent";

type SessionState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

interface TranscriptLine {
  role: "user" | "agent";
  text: string;
  time_sec: number;
}

export interface VoiceSessionPanelProps {
  sourceTemplate: string;
  agentId?: string | null;
  agentConfig: VoiceAgentFormData;
  /** Texto del contexto de marca asignado al agente (se fusiona con el prompt). */
  companyContext?: string | null;
  /** Nombre de la empresa del contexto asignado (para presentación en voz). */
  companyName?: string | null;
  ready?: boolean;
  onEndCall?: () => void;
  onCallSaved?: () => void;
  onCallStatusChange?: (active: boolean, durationSec: number) => void;
}

export function VoiceSessionPanel({
  sourceTemplate,
  agentId,
  agentConfig,
  companyContext,
  companyName,
  ready = true,
  onEndCall,
  onCallSaved,
  onCallStatusChange
}: VoiceSessionPanelProps) {
  const agentName = agentConfig.name?.trim() || "Agente";
  const agentInitial = agentName.charAt(0).toUpperCase() || "A";

  const [state, setState] = useState<SessionState>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [duration, setDuration] = useState(0);
  const [statusHint, setStatusHint] = useState("");

  const agentIdRef = useRef(agentId);
  const onCallSavedRef = useRef(onCallSaved);

  useEffect(() => { agentIdRef.current = agentId; }, [agentId]);
  useEffect(() => { onCallSavedRef.current = onCallSaved; }, [onCallSaved]);

  const sessionRef = useRef<Session | null>(null);
  const mainCtxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const recProcRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const configRef = useRef(agentConfig);
  const companyContextRef = useRef(companyContext);
  const companyNameRef = useRef(companyName);
  const nextTimeRef = useRef(0);
  const agentSpeakUntilRef = useRef(0);
  const micToGeminiBlockedRef = useRef(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(false);
  const setupDoneRef = useRef(false);
  const callSavedRef = useRef(false);
  const sessionStartRef = useRef<number | null>(null);
  const durationRef = useRef(0);
  const disconnectReasonRef = useRef("Agent Hangup");
  const transcriptLinesRef = useRef<TranscriptLine[]>([]);
  const goodbyeTriggeredRef = useRef(false);
  const autoHangupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopSessionRef = useRef<(userInitiated?: boolean) => void>(() => {});
  const recordDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const pcmBuffersRef = useRef<Float32Array[]>([]);
  const pcmSampleRateRef = useRef(48000);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { configRef.current = agentConfig; }, [agentConfig]);
  useEffect(() => { companyContextRef.current = companyContext; }, [companyContext]);
  useEffect(() => { companyNameRef.current = companyName; }, [companyName]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const isConnecting = state === "connecting";
  const isActive = state === "listening" || state === "thinking" || state === "speaking";

  useEffect(() => {
    onCallStatusChange?.(isActive || isConnecting, duration);
  }, [isActive, isConnecting, duration, onCallStatusChange]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (isActive || isConnecting) {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isActive, isConnecting]);

  const currentTimeSec = useCallback(() => {
    if (sessionStartRef.current) {
      return Math.max(0, Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }
    return durationRef.current;
  }, []);

  const appendTranscript = useCallback((role: "user" | "agent", text: string) => {
    if (!text.trim()) return;
    const time_sec = currentTimeSec();
    const prev = transcriptLinesRef.current;
    const last = prev[prev.length - 1];
    const next: TranscriptLine[] =
      last?.role === role
        ? [...prev.slice(0, -1), { role, text: last.text + text, time_sec: last.time_sec }]
        : [...prev, { role, text, time_sec }];
    transcriptLinesRef.current = next;
    setTranscript(next);
  }, [currentTimeSec]);

  const canSendMicToGemini = useCallback(() => {
    if (mutedRef.current || !setupDoneRef.current || !sessionRef.current) return false;
    if (micToGeminiBlockedRef.current) return false;
    const ctx = mainCtxRef.current;
    if (ctx && ctx.currentTime < agentSpeakUntilRef.current + 0.25) return false;
    return true;
  }, []);

  const stopCallRecording = useCallback(async (): Promise<Blob | null> => {
    await new Promise(r => setTimeout(r, 300));

    const pcm = mergePcmBuffers(pcmBuffersRef.current);
    pcmBuffersRef.current = [];

    if (pcm.length > 1600) {
      const rate = 16000;
      const down = downsamplePcm(pcm, pcmSampleRateRef.current, rate);
      const wav = encodeWav(down, rate);
      if (wav.size > 500) return wav;
    }

    return null;
  }, []);

  const scheduleAutoHangup = useCallback((role: "user" | "agent") => {
    if (goodbyeTriggeredRef.current) return;
    goodbyeTriggeredRef.current = true;
    const name = configRef.current.name?.trim() || "Agente";
    setStatusHint(
      role === "user"
        ? "Despedida detectada · Colgando..."
        : `${name} se despidió · Colgando...`
    );
    const delayMs = role === "agent" ? 2200 : 2800;
    autoHangupTimerRef.current = setTimeout(() => {
      stopSessionRef.current();
    }, delayMs);
  }, []);

  const checkGoodbyeAndHangup = useCallback(() => {
    if (goodbyeTriggeredRef.current || !setupDoneRef.current) return;
    const lines = transcriptLinesRef.current;
    if (lines.length < 2) return;
    const last = lines[lines.length - 1];
    if (last && isGoodbyeUtterance(last.text)) {
      scheduleAutoHangup(last.role);
    }
  }, [scheduleAutoHangup]);

  const playAudioChunk = useCallback(async (b64: string, mimeType?: string) => {
    const ctx = mainCtxRef.current;
    const gain = gainNodeRef.current;
    const recordDest = recordDestRef.current;
    if (!ctx || !gain || !recordDest) return;

    const rate = parsePcmRate(mimeType);
    const float32 = pcmBase64ToFloat32(b64);
    if (ctx.state === "suspended") await ctx.resume();

    gain.gain.value = configRef.current.volume ?? 1;

    const buf = ctx.createBuffer(1, float32.length, rate);
    buf.copyToChannel(float32 as Float32Array<ArrayBuffer>, 0);

    const source = ctx.createBufferSource();
    source.buffer = buf;
    const speed = configRef.current.voice_speed || 1;
    source.playbackRate.value = speed;
    source.connect(gain);
    source.connect(recordDest);

    const startAt = Math.max(nextTimeRef.current, ctx.currentTime + 0.02);
    source.start(startAt);
    const endAt = startAt + buf.duration / speed;
    nextTimeRef.current = endAt;
    agentSpeakUntilRef.current = endAt;

    setState(prev => (prev === "thinking" || prev === "listening" ? "speaking" : prev));
  }, []);

  const handleServerMessage = useCallback((msg: LiveServerMessage) => {
    if (msg.setupComplete && !setupDoneRef.current) {
      setupDoneRef.current = true;
      setState("listening");
      setStatusHint("Conectado · Di «aló» o saluda para iniciar (la IA espera tu señal)");

      sessionStartRef.current = Date.now();
      micToGeminiBlockedRef.current = false;

      sessionRef.current?.sendClientContent({
        turns: [{
          role: "user",
          parts: [{ text: buildVoiceKickoffMessage(configRef.current.source_template, companyNameRef.current) }],
        }],
        turnComplete: true
      });
    }

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.inputTranscription?.text && !micToGeminiBlockedRef.current) {
      appendTranscript("user", sc.inputTranscription.text);
      setState("thinking");
    }
    if (sc.outputTranscription?.text) {
      appendTranscript("agent", sc.outputTranscription.text);
    }

    const parts = sc.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData.mimeType?.includes("audio")) {
        playAudioChunk(part.inlineData.data, part.inlineData.mimeType);
      }
    }

    if (sc.interrupted && mainCtxRef.current) {
      nextTimeRef.current = mainCtxRef.current.currentTime;
      agentSpeakUntilRef.current = mainCtxRef.current.currentTime;
    }
    if (sc.turnComplete) {
      micToGeminiBlockedRef.current = false;
      checkGoodbyeAndHangup();
      setState("listening");
    }
  }, [appendTranscript, playAudioChunk, checkGoodbyeAndHangup]);

  const saveCallRecord = useCallback(async (snapshot: {
    lines: TranscriptLine[];
    durationSec: number;
    disconnectReason: string;
  }, audioBlob: Blob | null) => {
    const id = agentIdRef.current;
    if (!id || callSavedRef.current) return false;

    const { lines, durationSec, disconnectReason } = snapshot;
    if (durationSec < 1 && lines.length === 0) return false;

    callSavedRef.current = true;
    const now = new Date();
    try {
      const token = await getAuthToken();
      if (!token) {
        setError("Sesión no válida. Inicia sesión de nuevo para guardar la llamada.");
        callSavedRef.current = false;
        return false;
      }

      const payload = {
        voice_agent_id: id,
        phone_number: "Prueba web",
        duration_sec: durationSec,
        disconnect_reason: disconnectReason,
        transcript: lines.map(({ role, text, time_sec }) => ({ role, text, time_sec })),
        dynamic_variables: {
          contact_name: "",
          contact_email: "",
          current_time: now.toLocaleString("es-CO", { dateStyle: "full", timeStyle: "long" }),
          agent_name: configRef.current.name
        }
      };

      let res: Response;
      const bodyPayload: Record<string, unknown> = { ...payload };

      if (audioBlob && audioBlob.size > 0) {
        bodyPayload.audio_base64 = await blobToBase64(audioBlob);
        bodyPayload.audio_mime = audioBlob.type || "audio/wav";
      }

      res = await fetch("/api/voice/agents/calls", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        callSavedRef.current = false;
        console.error("[voice] Error al guardar llamada:", data.error || res.status);
        setError(data.error || "No se pudo guardar la llamada en el registro.");
        return false;
      }
      onCallSavedRef.current?.();
      return true;
    } catch (err) {
      callSavedRef.current = false;
      console.error("[voice] Error de red al guardar llamada:", err);
      setError("Error de red al guardar la llamada.");
      return false;
    }
  }, []);

  const cleanupResources = useCallback(() => {
    setupDoneRef.current = false;
    goodbyeTriggeredRef.current = false;
    sessionStartRef.current = null;
    if (autoHangupTimerRef.current) {
      clearTimeout(autoHangupTimerRef.current);
      autoHangupTimerRef.current = null;
    }
    transcriptLinesRef.current = [];
    sessionRef.current?.close();
    sessionRef.current = null;
    procRef.current?.disconnect();
    procRef.current = null;
    recProcRef.current?.disconnect();
    recProcRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recordDestRef.current = null;
    mainCtxRef.current?.close().catch(() => {});
    mainCtxRef.current = null;
    gainNodeRef.current = null;
    nextTimeRef.current = 0;
    agentSpeakUntilRef.current = 0;
    micToGeminiBlockedRef.current = true;
    setState("idle");
    setDuration(0);
    setStatusHint("");
  }, []);

  const stopSession = useCallback(async (userInitiated = false) => {
    if (userInitiated) disconnectReasonRef.current = "User Ended";

    const snapshot = {
      lines: [...transcriptLinesRef.current],
      durationSec: durationRef.current,
      disconnectReason: disconnectReasonRef.current
    };

    const audioBlob = await stopCallRecording();
    const saved = await saveCallRecord(snapshot, audioBlob);
    cleanupResources();
    if (saved || (snapshot.durationSec < 1 && snapshot.lines.length === 0)) {
      onEndCall?.();
    }
  }, [cleanupResources, onEndCall, saveCallRecord, stopCallRecording]);

  stopSessionRef.current = stopSession;

  const startSession = useCallback(async () => {
    setState("connecting");
    setError("");
    setStatusHint("Obteniendo configuración...");
    setTranscript([]);
    transcriptLinesRef.current = [];
    pcmBuffersRef.current = [];
    micToGeminiBlockedRef.current = true;
    agentSpeakUntilRef.current = 0;
    goodbyeTriggeredRef.current = false;
    setDuration(0);
    setupDoneRef.current = false;
    callSavedRef.current = false;
    disconnectReasonRef.current = "Agent Hangup";
    sessionStartRef.current = null;

    let apiKey = "";
    try {
      const res = await fetch("/api/voice/gemini-config");
      const data = await res.json();
      if (!res.ok || !data.apiKey) {
        setError(data.error || "No se pudo cargar la API key de Google.");
        setState("error");
        return;
      }
      apiKey = data.apiKey;
    } catch {
      setError("Error de red al obtener la configuración de Gemini.");
      setState("error");
      return;
    }

    try {
      setStatusHint("Activando micrófono...");
      const cfg = configRef.current;
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = micStream;

      const mainCtx = new AudioContext();
      await mainCtx.resume();
      mainCtxRef.current = mainCtx;
      pcmSampleRateRef.current = mainCtx.sampleRate;
      nextTimeRef.current = mainCtx.currentTime;

      gainNodeRef.current = mainCtx.createGain();
      gainNodeRef.current.gain.value = cfg.volume ?? 1;
      gainNodeRef.current.connect(mainCtx.destination);

      recordDestRef.current = mainCtx.createMediaStreamDestination();

      const micSource = mainCtx.createMediaStreamSource(micStream);
      micSource.connect(recordDestRef.current);

      const proc = mainCtx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      proc.onaudioprocess = (e) => {
        if (!canSendMicToGemini()) return;
        const channel = e.inputBuffer.getChannelData(0);
        const b64 = resampleTo16kPcm(channel, mainCtx.sampleRate);
        sessionRef.current!.sendRealtimeInput({
          audio: { data: b64, mimeType: "audio/pcm;rate=16000" }
        });
      };
      micSource.connect(proc);
      const procSilent = mainCtx.createGain();
      procSilent.gain.value = 0;
      proc.connect(procSilent);
      procSilent.connect(mainCtx.destination);

      const recMonitor = mainCtx.createMediaStreamSource(recordDestRef.current.stream);
      const recProc = mainCtx.createScriptProcessor(4096, 1, 1);
      recProcRef.current = recProc;
      recProc.onaudioprocess = (e) => {
        const channel = e.inputBuffer.getChannelData(0);
        pcmBuffersRef.current.push(new Float32Array(channel));
      };
      recMonitor.connect(recProc);
      const recSilent = mainCtx.createGain();
      recSilent.gain.value = 0;
      recProc.connect(recSilent);
      recSilent.connect(mainCtx.destination);

      setStatusHint("Conectando con Gemini Live...");

      const ai = new GoogleGenAI({ apiKey });
      const session = await ai.live.connect({
        model: cfg.model || DEFAULT_LIVE_MODEL,
        config: buildGeminiLiveSessionConfig({
          systemInstruction: buildPhoneAgentSystemInstruction(
            cfg.prompt,
            companyContextRef.current ?? "",
            cfg.name,
            cfg.source_template,
            companyNameRef.current
          ),
          voiceName: cfg.voice_name || "Kore",
          temperature: cfg.temperature,
        }),
        callbacks: {
          onmessage: handleServerMessage,
          onerror: (e: ErrorEvent) => {
            setError(e.message || "Error en la conexión con Gemini Live.");
            setState("error");
          },
          onclose: (e: CloseEvent) => {
            if (e.code !== 1000 && e.code !== 1005) {
              setError(`Conexión cerrada (${e.code}): ${e.reason || "revisa tu API key"}`);
              setState("error");
            }
          }
        }
      });

      sessionRef.current = session;
      setStatusHint("Esperando confirmación del servidor...");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "No se pudo iniciar la sesión.";
      setError(message.includes("API key") ? `${message} — Revisa aistudio.google.com` : message);
      setState("error");
      cleanupResources();
    }
  }, [handleServerMessage, cleanupResources, canSendMicToGemini]);

  useEffect(() => () => cleanupResources(), [cleanupResources]);

  const voiceSubtitle = `Voz ${agentConfig.voice_name || "Kore"} · Español`;

  const avatarMode =
    state === "speaking" ? "speaking" :
    state === "listening" || state === "thinking" ? "listening" :
    isConnecting ? "connecting" : "idle";

  const statusLabel =
    state === "idle" ? "Lista para conversar" :
    state === "connecting" ? (statusHint || "Conectando...") :
    state === "listening" ? "En línea · Escuchando" :
    state === "thinking" ? "En línea · Procesando" :
    state === "speaking" ? "En línea · Hablando" :
    state === "error" ? "Error de conexión" : "Desconectado";

  const geminiLabel =
    isActive ? "Gemini Live · Conectado" :
    isConnecting ? "Gemini Live · Conectando" :
    state === "error" ? "Gemini Live · Error" : "Gemini Live · Listo";

  const statusDotClass =
    isActive ? "bg-emerald-400 premium-voice-dot-live" :
    isConnecting ? "bg-[var(--nv-accent)] animate-pulse" :
    state === "error" ? "bg-red-400" : "bg-emerald-400/70";

  return (
    <div className="flex-1 flex min-h-0 p-4 gap-4 overflow-hidden nv-voice-session">
      <aside className="w-[min(100%,320px)] shrink-0 flex flex-col">
        <div className="flex-1 rounded-2xl border border-white/[.08] bg-[#0c0c10]/80 backdrop-blur-sm p-6 flex flex-col min-h-[440px]">
          <div className="flex flex-col items-center text-center flex-1">
            <PremiumVoiceAvatar
              initial={agentInitial}
              mode={avatarMode}
            />

            <h2 className="mt-5 text-xl font-bold text-white tracking-tight">{agentName}</h2>
            <p className="mt-1 text-xs text-gray-500">{voiceSubtitle}</p>

            <div className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#5b5bf6]/10 border border-[#5b5bf6]/25">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#a5a5ff]">
                Gemini Live
              </span>
            </div>

            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[.03] border border-white/[.08]">
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} />
              <span className="text-[11px] text-gray-400">{statusLabel}</span>
            </div>

            {isActive && duration > 0 && (
              <p className="text-2xl font-semibold text-white tabular-nums mt-4 tracking-tight">
                {String(Math.floor(duration / 60)).padStart(2, "0")}:{String(duration % 60).padStart(2, "0")}
              </p>
            )}
          </div>

          <div className="mt-auto pt-6 space-y-2.5">
            {state === "idle" || state === "error" ? (
              <>
                <button
                  onClick={startSession}
                  disabled={!ready}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#5b5bf6] to-[#7c6cf6] hover:from-[#6b6bf7] hover:to-[#8b7cf7] shadow-[0_8px_32px_rgba(91,91,246,0.35)] transition-all disabled:opacity-45 disabled:shadow-none"
                >
                  {state === "error" ? (
                    <><RefreshCw className="w-4 h-4" /> Reintentar</>
                  ) : (
                    <><Mic className="w-4 h-4" /> Iniciar conversación</>
                  )}
                </button>
                {state === "idle" && (
                  <p className="text-[11px] text-gray-600 text-center leading-relaxed px-1">
                    Permite el micrófono cuando el navegador lo solicite.
                  </p>
                )}
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
              <button
                disabled
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm text-gray-400 border border-white/[.08] bg-white/[.02] cursor-not-allowed"
              >
                <Loader2 className="w-4 h-4 animate-spin" /> {statusHint || "Conectando..."}
              </button>
            ) : (
              <>
                <button
                  onClick={() => setMuted(m => !m)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    muted
                      ? "bg-red-500/[.08] border-red-500/25 text-red-400"
                      : "bg-white/[.03] border-white/[.08] text-gray-300 hover:bg-white/[.05]"
                  }`}
                >
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {muted ? "Micrófono silenciado" : "Micrófono activo"}
                </button>
                <button
                  onClick={() => stopSession(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-red-500/[.08] border border-red-500/25 text-red-400 hover:bg-red-500/[.12] transition-colors"
                >
                  <PhoneOff className="w-4 h-4" /> Terminar conversación
                </button>
              </>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/[.06] border border-red-500/20 text-[11px] text-red-400 leading-relaxed">
              {error}
            </div>
          )}

          {statusHint && isActive && (
            <p className="mt-3 text-[10px] text-gray-500 leading-relaxed text-center">{statusHint}</p>
          )}
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col rounded-2xl border border-white/[.08] bg-[#0c0c10]/80 backdrop-blur-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[.06] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-4 h-4 text-[#a5a5ff] shrink-0" />
            <span className="text-sm font-medium text-gray-200">Transcripción en vivo</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[.03] border border-white/[.08] shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-400 premium-voice-dot-live" : isConnecting ? "bg-[var(--nv-accent)] animate-pulse" : "bg-gray-600"}`} />
            <span className="text-[10px] text-gray-500">{geminiLabel}</span>
          </div>
        </div>

        <div ref={transcriptRef} className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[320px]">
          {transcript.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 py-10">
              <div className="flex items-end justify-center gap-1 h-12 mb-6">
                {[0, 1, 2, 3, 4, 5, 6].map(i => (
                  <span
                    key={i}
                    className="w-1 rounded-full bg-gradient-to-t from-[#5b5bf6] to-[#a5a5ff] premium-voice-wave-bar"
                    style={{
                      height: `${14 + (i % 3) * 10}px`,
                      animationDelay: `${i * 0.12}s`,
                    }}
                  />
                ))}
              </div>
              <p className="text-base font-semibold text-white">La conversación aparecerá aquí</p>
              <p className="text-sm text-gray-500 mt-2 max-w-sm leading-relaxed">
                {isActive
                  ? `${agentName} saludará primero. Luego habla con naturalidad.`
                  : `Pulsa «Iniciar conversación» y habla con ${agentName}. Verás la transcripción en tiempo real.`}
              </p>
            </div>
          ) : (
            transcript.map((line, i) => (
              <div
                key={i}
                className={`flex ${line.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
              >
                <div className={`max-w-[82%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed ${
                  line.role === "user"
                    ? "bg-[#5b5bf6]/15 border border-[#5b5bf6]/25 text-gray-100"
                    : "bg-white/[.04] border border-white/[.08] text-gray-200"
                }`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 text-gray-500">
                    {line.role === "user" ? "Tú" : agentName}
                  </p>
                  {line.text}
                </div>
              </div>
            ))
          )}

          {state === "thinking" && (
            <div className="flex justify-start animate-fade-in">
              <div className="px-4 py-3 rounded-2xl bg-white/[.04] border border-white/[.08]">
                <div className="flex gap-1 items-center h-4">
                  {[0, 150, 300].map(delay => (
                    <div
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-[#5b5bf6]/60 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/[.06] flex items-center gap-2 shrink-0 bg-white/[.01]">
          <Headphones className="w-3.5 h-3.5 text-gray-600 shrink-0" />
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Conexión directa con Gemini Live. Usa audífonos para mejor calidad de audio.
          </p>
        </div>
      </section>
    </div>
  );
}
