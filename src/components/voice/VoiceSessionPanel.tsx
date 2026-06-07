"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, PhoneOff, Loader2, Sparkles } from "lucide-react";
import { GoogleGenAI, Modality, type Session, type LiveServerMessage } from "@google/genai";
import { getTemplateMeta } from "@/lib/voice-agent-templates";
import { DEFAULT_LIVE_MODEL } from "@/lib/voice-agent-options";
import { geminiTemperature } from "@/lib/voice-agent-audio";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import { parsePcmRate, pcmBase64ToFloat32, resampleTo16kPcm } from "@/lib/voice-session-audio";
import { getAuthHeaders, getAuthToken } from "@/lib/voice-agents-api";
import { encodeWav, mergePcmBuffers, downsamplePcm } from "@/lib/call-recording";
import { blobToBase64 } from "@/lib/brand-ui";
import { isGoodbyeUtterance } from "@/lib/voice-goodbye-detection";
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
  ready = true,
  onEndCall,
  onCallSaved,
  onCallStatusChange
}: VoiceSessionPanelProps) {
  const meta = getTemplateMeta(sourceTemplate);
  const accent = agentConfig.color || meta.color;

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
    setStatusHint(
      role === "user"
        ? "Despedida detectada · Colgando..."
        : "Lia se despidió · Colgando..."
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
      setStatusHint("Conectado · Habla o espera el saludo de Lia");

      sessionStartRef.current = Date.now();

      sessionRef.current?.sendClientContent({
        turns: [{ role: "user", parts: [{ text: "Inicia la llamada con un saludo breve en español colombiano." }] }],
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
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice_name || "Aoede" } }
          },
          thinkingConfig: { includeThoughts: false, thinkingBudget: 0 },
          temperature: geminiTemperature(cfg.temperature),
          systemInstruction: `${mergeCompanyContext(cfg.prompt, companyContextRef.current)}

Al iniciar la llamada, saluda con UNA sola frase breve en español colombiano y luego espera en silencio a que el usuario hable. No continúes hablando hasta que el usuario responda.
Si el usuario se despide o indica que quiere terminar la conversación, despídete de forma breve y cordial (máximo una oración).`,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
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

  const statusLabel =
    state === "idle" ? "Lista para iniciar" :
    state === "connecting" ? (statusHint || "Conectando...") :
    state === "listening" ? "Escuchando" :
    state === "thinking" ? "Procesando" :
    state === "speaking" ? "Hablando" : "Error";

  return (
    <div className="flex-1 flex min-h-0 p-4 gap-4 overflow-hidden">
      <aside className="w-[300px] shrink-0 flex flex-col gap-3">
        <div className="flex-1 rounded-2xl border border-white/[.10] bg-noova-surface p-5 flex flex-col min-h-[420px]">
          <div className="flex flex-col items-center text-center pb-5 border-b border-white/[.06]">
            <div className="relative mb-4">
              {(state === "speaking" || state === "listening") && (
                <>
                  <div className={`absolute -inset-2 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-md`} />
                  <div className="absolute inset-0 rounded-full border border-white/20 animate-pulse" />
                </>
              )}
              <div className={`relative w-[88px] h-[88px] rounded-full flex items-center justify-center bg-gradient-to-br ${accent} shadow-lg ring-4 ring-noova-surface`}>
                <span className="text-2xl font-bold text-white">L</span>
              </div>
            </div>
            <p className="text-sm font-semibold text-white">Lia</p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[.04] border border-white/[.08]">
              <span className={`w-1.5 h-1.5 rounded-full ${
                isActive ? "bg-[#5b5bf6] animate-pulse" :
                isConnecting ? "bg-amber-400 animate-pulse" :
                state === "error" ? "bg-red-400" : "bg-gray-500"
              }`} />
              <span className="text-[11px] text-gray-400">{statusLabel}</span>
            </div>
            {isActive && statusHint && (
              <p className="text-[10px] text-gray-400 mt-2 max-w-[200px] leading-relaxed">{statusHint}</p>
            )}
          </div>

          <div className="pt-5 space-y-2.5 flex-1">
            {!isActive && !isConnecting ? (
              <button
                onClick={startSession}
                disabled={!ready}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white border border-white/10 bg-white/[.06] hover:bg-white/[.10] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className={`flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br ${accent}`}>
                  <Mic className="w-4 h-4" />
                </span>
                Iniciar sesión
              </button>
            ) : isConnecting ? (
              <button disabled className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-gray-400 border border-white/[.08] bg-white/[.03] cursor-not-allowed">
                <Loader2 className="w-4 h-4 animate-spin" /> Conectando...
              </button>
            ) : (
              <>
                <button
                  onClick={() => setMuted(m => !m)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                    muted
                      ? "bg-red-500/[.08] border-red-500/25 text-red-400"
                      : "bg-white/[.03] border-white/[.08] text-gray-300 hover:text-white hover:bg-white/[.06]"
                  }`}
                >
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {muted ? "Micrófono silenciado" : "Micrófono activo"}
                </button>
                <button
                  onClick={() => stopSession(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-red-500/[.08] border border-red-500/25 text-red-400 hover:bg-red-500/15 transition-all"
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
        </div>

        <div className="rounded-xl border border-white/[.10] bg-noova-surface px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Motor de voz</p>
          <p className="text-[11px] text-gray-300 font-mono leading-snug line-clamp-2">
            {agentConfig.model || DEFAULT_LIVE_MODEL}
          </p>
          <p className="text-[10px] text-gray-400 mt-1.5">Voz {agentConfig.voice_name} · Español</p>
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col rounded-2xl border border-white/[.10] bg-noova-surface overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[.06] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#5b5bf6]/80" />
            <span className="text-xs font-semibold text-gray-300 tracking-wide">Transcripción en vivo</span>
          </div>
          {transcript.length > 0 && (
            <span className="text-[10px] text-gray-400 tabular-nums">{transcript.length} mensajes</span>
          )}
        </div>

        <div
          ref={transcriptRef}
          className="flex-1 overflow-y-auto p-5 space-y-3 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(91,91,246,.06),transparent)] min-h-[360px]"
        >
          {transcript.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-center px-6">
              <div className="w-14 h-14 rounded-2xl border border-white/[.08] bg-white/[.02] flex items-center justify-center mb-4">
                <div className="flex gap-1 items-end h-5">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className={`w-1 rounded-full bg-gradient-to-t ${accent} opacity-40`}
                      style={{ height: `${10 + (i % 3) * 6}px` }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-sm text-gray-300 font-medium">Sin conversación aún</p>
              <p className="text-xs text-gray-400 mt-1.5 max-w-xs leading-relaxed">
                {isActive
                  ? "Lia saludará primero. Luego habla con naturalidad."
                  : "Inicia la sesión para probar tu agente con la configuración actual."}
              </p>
            </div>
          ) : (
            transcript.map((line, i) => (
              <div key={i} className={`flex ${line.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed ${
                  line.role === "user"
                    ? "bg-[#5b5bf6]/15 border border-[#5b5bf6]/20 text-gray-100 rounded-br-md"
                    : "bg-white/[.03] border border-white/[.07] text-gray-200 rounded-bl-md"
                }`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${
                    line.role === "user" ? "text-[#5b5bf6]/90" : "text-gray-500"
                  }`}>
                    {line.role === "user" ? "Tú" : "Lia"}
                  </p>
                  {line.text}
                </div>
              </div>
            ))
          )}

          {state === "thinking" && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white/[.03] border border-white/[.07]">
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
      </section>
    </div>
  );
}
