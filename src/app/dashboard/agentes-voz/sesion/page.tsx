"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mic, MicOff, PhoneOff, Loader2, ChevronLeft, Settings2, Radio, Sparkles } from "lucide-react";
import Link from "next/link";
import { GoogleGenAI, Modality, type Session, type LiveServerMessage } from "@google/genai";
import { VOICE_AGENT_TEMPLATES, getTemplateDefaults, getTemplateMeta } from "@/lib/voice-agent-templates";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import { DEFAULT_LIVE_MODEL } from "@/lib/voice-agent-options";
import type { VoiceAgentFormData } from "@/types/voice-agent";

const PROMPTS = VOICE_AGENT_TEMPLATES;

// ─── Helpers de audio ────────────────────────────────────────────────────────
function resampleTo16kPcm(input: Float32Array, inputRate: number): string {
  const targetRate = 16000;
  let samples: Int16Array;

  if (inputRate === targetRate) {
    samples = float32ToInt16(input);
  } else {
    const ratio = inputRate / targetRate;
    const outLen = Math.floor(input.length / ratio);
    samples = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const idx = Math.min(Math.floor(i * ratio), input.length - 1);
      const s = Math.max(-1, Math.min(1, input[idx]));
      samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }

  const bytes = new Uint8Array(samples.buffer);
  let b = "";
  for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
  return btoa(b);
}

function float32ToInt16(buf: Float32Array): Int16Array {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const s = Math.max(-1, Math.min(1, buf[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function parsePcmRate(mimeType?: string): number {
  const m = mimeType?.match(/rate=(\d+)/);
  return m ? parseInt(m[1], 10) : 24000;
}

function pcmBase64ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
  return float32;
}

type SessionState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

interface TranscriptLine {
  role: "user" | "agent";
  text: string;
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function SesionPage() {
  const params   = useSearchParams();
  const router   = useRouter();
  const template = params.get("template") || "lead-qualification";
  const info     = PROMPTS[template] ?? PROMPTS["lead-qualification"];
  const meta     = getTemplateMeta(template);

  const [agentConfig, setAgentConfig] = useState<VoiceAgentFormData>(() =>
    getTemplateDefaults(template)
  );
  const [configLoaded, setConfigLoaded] = useState(false);

  const [state,      setState]      = useState<SessionState>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [muted,      setMuted]      = useState(false);
  const [error,      setError]      = useState("");
  const [duration,   setDuration]   = useState(0);
  const [statusHint, setStatusHint] = useState("");

  const sessionRef    = useRef<Session | null>(null);
  const micCtxRef     = useRef<AudioContext | null>(null);
  const procRef       = useRef<ScriptProcessorNode | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const playCtxRef    = useRef<AudioContext | null>(null);
  const nextTimeRef   = useRef(0);
  const timerRef      = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const mutedRef      = useRef(false);
  const setupDoneRef  = useRef(false);
  const inputRateRef  = useRef(16000);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/voice/agents?template_id=${template}`, { headers });
        const data = await res.json();
        if (data.agent) {
          const a = data.agent;
          setAgentConfig({
            template_id: a.template_id,
            name: a.name,
            prompt: a.prompt,
            voice_name: a.voice_name,
            model: a.model,
            voice_speed: Number(a.voice_speed),
            temperature: Number(a.temperature),
            volume: Number(a.volume),
            llm_model: a.llm_model,
            color: a.color
          });
        } else if (data.defaults) {
          setAgentConfig(data.defaults);
        }
      } catch { /* usa defaults locales */ }
      setConfigLoaded(true);
    })();
  }, [template]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    if (state === "listening" || state === "thinking" || state === "speaking") {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const appendTranscript = useCallback((role: "user" | "agent", text: string) => {
    if (!text.trim()) return;
    setTranscript(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === role) {
        return [...prev.slice(0, -1), { role, text: last.text + text }];
      }
      return [...prev, { role, text }];
    });
  }, []);

  const playAudioChunk = useCallback(async (b64: string, mimeType?: string) => {
    const rate = parsePcmRate(mimeType);
    const float32 = pcmBase64ToFloat32(b64);

    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext();
      nextTimeRef.current = playCtxRef.current.currentTime;
    }
    const ctx = playCtxRef.current;
    if (ctx.state === "suspended") await ctx.resume();

    const buf = ctx.createBuffer(1, float32.length, rate);
    buf.copyToChannel(float32 as Float32Array<ArrayBuffer>, 0);

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);

    const startAt = Math.max(nextTimeRef.current, ctx.currentTime + 0.02);
    source.start(startAt);
    nextTimeRef.current = startAt + buf.duration;

    setState(prev => (prev === "thinking" || prev === "listening" ? "speaking" : prev));
  }, []);

  const startMicStreaming = useCallback((session: Session) => {
    if (!micCtxRef.current || !procRef.current) return;

    procRef.current.onaudioprocess = (e) => {
      if (mutedRef.current || !setupDoneRef.current || !sessionRef.current) return;
      const channel = e.inputBuffer.getChannelData(0);
      const b64 = resampleTo16kPcm(channel, inputRateRef.current);
      session.sendRealtimeInput({
        audio: { data: b64, mimeType: "audio/pcm;rate=16000" }
      });
    };
  }, []);

  const handleServerMessage = useCallback((msg: LiveServerMessage) => {
    if (msg.setupComplete && !setupDoneRef.current) {
      setupDoneRef.current = true;
      setState("listening");
      setStatusHint("Conectado · Habla o espera el saludo de Lia");

      const session = sessionRef.current;
      if (session) {
        startMicStreaming(session);
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text: "Inicia la llamada con un saludo breve en español colombiano." }] }],
          turnComplete: true
        });
      }
    }

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.inputTranscription?.text) {
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
      // No mostramos part.text: incluye razonamiento interno en inglés (thoughts)
    }

    if (sc.interrupted && playCtxRef.current) {
      nextTimeRef.current = playCtxRef.current.currentTime;
    }

    if (sc.turnComplete) {
      setState("listening");
    }
  }, [appendTranscript, playAudioChunk, startMicStreaming]);

  const cleanupResources = useCallback(() => {
    setupDoneRef.current = false;
    sessionRef.current?.close();
    sessionRef.current = null;
    procRef.current?.disconnect();
    procRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    micCtxRef.current?.close().catch(() => {});
    micCtxRef.current = null;
    playCtxRef.current?.close().catch(() => {});
    playCtxRef.current = null;
    nextTimeRef.current = 0;
    setState("idle");
    setDuration(0);
    setStatusHint("");
  }, []);

  const stopSession = useCallback(() => {
    cleanupResources();
    router.push(`/dashboard/agentes-voz/configuracion?template=${template}`);
  }, [cleanupResources, router, template]);

  const startSession = useCallback(async () => {
    setState("connecting");
    setError("");
    setStatusHint("Obteniendo configuración...");
    setTranscript([]);
    setDuration(0);
    setupDoneRef.current = false;

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
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = micStream;

      micCtxRef.current = new AudioContext();
      inputRateRef.current = micCtxRef.current.sampleRate;
      await micCtxRef.current.resume();

      const source = micCtxRef.current.createMediaStreamSource(micStream);
      const proc   = micCtxRef.current.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      source.connect(proc);
      proc.connect(micCtxRef.current.destination);

      setStatusHint("Conectando con Gemini Live...");

      const ai = new GoogleGenAI({ apiKey });
      const session = await ai.live.connect({
        model: agentConfig.model || DEFAULT_LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: agentConfig.voice_name || "Aoede" } }
          },
          thinkingConfig: {
            includeThoughts: false,
            thinkingBudget: 0
          },
          temperature: agentConfig.temperature,
          systemInstruction: agentConfig.prompt,
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
              setError(`Conexión cerrada (${e.code}): ${e.reason || "revisa tu API key en AI Studio"}`);
              setState("error");
            }
          }
        }
      });

      sessionRef.current = session;
      setStatusHint("Esperando confirmación del servidor...");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "No se pudo iniciar la sesión.";
      setError(
        message.includes("API key")
          ? `${message} — Crea una key en aistudio.google.com (formato AIzaSy...)`
          : message
      );
      setState("error");
      cleanupResources();
    }
  }, [agentConfig, handleServerMessage, cleanupResources, stopSession]);

  useEffect(() => () => cleanupResources(), [cleanupResources]);

  const isConnecting = state === "connecting";
  const isActive = state === "listening" || state === "thinking" || state === "speaking";
  const accent = agentConfig.color || info.color;

  const statusLabel =
    state === "idle" ? "Lista para iniciar" :
    state === "connecting" ? (statusHint || "Conectando...") :
    state === "listening" ? "Escuchando" :
    state === "thinking" ? "Procesando" :
    state === "speaking" ? "Hablando" : "Error";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0b10] text-white overflow-hidden">

      {/* Header */}
      <header className="shrink-0 border-b border-white/[.06] bg-[#0d0e14]/80 backdrop-blur-sm px-5 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard/agentes-voz"
              className="p-2 rounded-lg border border-white/[.08] bg-white/[.03] text-gray-400 hover:text-white hover:bg-white/[.06] transition-colors shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[15px] font-semibold text-white truncate">
                  {agentConfig.name || info.name}
                </h1>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  meta.tag === "Inbound"
                    ? "bg-violet-500/10 text-violet-300 border-violet-500/25"
                    : "bg-cyan-500/10 text-cyan-300 border-cyan-500/25"
                }`}>
                  {meta.tag}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5">
                <Radio className="w-3 h-3" />
                Sesión de prueba · Gemini Live
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/dashboard/agentes-voz/configuracion?template=${template}`}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-gray-400 border border-white/[.08] hover:text-white hover:bg-white/[.04] transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Configuración
            </Link>
            {(isActive || isConnecting) && (
              <div className="flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full bg-emerald-500/[.08] border border-emerald-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="text-xs font-semibold text-emerald-400 tabular-nums">{formatTime(duration)}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0 p-4 gap-4 overflow-hidden">

        {/* Panel de control */}
        <aside className="w-[300px] shrink-0 flex flex-col gap-3">
          <div className="flex-1 rounded-2xl border border-white/[.08] bg-[#12131a] p-5 flex flex-col">
            {/* Avatar + estado */}
            <div className="flex flex-col items-center text-center pb-5 border-b border-white/[.06]">
              <div className="relative mb-4">
                {(state === "speaking" || state === "listening") && (
                  <>
                    <div className={`absolute -inset-2 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-md`} />
                    <div className={`absolute inset-0 rounded-full border border-white/20 animate-pulse`} />
                  </>
                )}
                <div className={`relative w-[88px] h-[88px] rounded-full flex items-center justify-center bg-gradient-to-br ${accent} shadow-lg ring-4 ring-[#12131a]`}>
                  <span className="text-2xl font-bold text-white tracking-tight">L</span>
                </div>
              </div>
              <p className="text-sm font-semibold text-white">Lia</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[.04] border border-white/[.08]">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isActive ? "bg-emerald-400 animate-pulse" :
                  isConnecting ? "bg-amber-400 animate-pulse" :
                  state === "error" ? "bg-red-400" : "bg-gray-500"
                }`} />
                <span className="text-[11px] text-gray-400">{statusLabel}</span>
              </div>
              {isActive && statusHint && (
                <p className="text-[10px] text-gray-600 mt-2 max-w-[200px] leading-relaxed">{statusHint}</p>
              )}
            </div>

            {/* Controles */}
            <div className="pt-5 space-y-2.5 flex-1">
              {!isActive && !isConnecting ? (
                <button
                  onClick={startSession}
                  disabled={!configLoaded}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white border border-white/10 bg-white/[.06] hover:bg-white/[.10] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className={`flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br ${accent}`}>
                    <Mic className="w-4 h-4" />
                  </span>
                  Iniciar sesión
                </button>
              ) : isConnecting ? (
                <button
                  disabled
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-gray-400 border border-white/[.08] bg-white/[.03] cursor-not-allowed"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Conectando...
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
                    onClick={stopSession}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-red-500/[.08] border border-red-500/25 text-red-400 hover:bg-red-500/15 transition-all"
                  >
                    <PhoneOff className="w-4 h-4" />
                    Terminar sesión
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

          {/* Meta técnica */}
          <div className="rounded-xl border border-white/[.06] bg-[#12131a]/60 px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-2">Motor de voz</p>
            <p className="text-[11px] text-gray-500 font-mono leading-snug line-clamp-2">
              {agentConfig.model || DEFAULT_LIVE_MODEL}
            </p>
            <p className="text-[10px] text-gray-600 mt-1.5">
              Voz {agentConfig.voice_name} · Español
            </p>
          </div>
        </aside>

        {/* Transcripción */}
        <section className="flex-1 min-w-0 flex flex-col rounded-2xl border border-white/[.08] bg-[#12131a] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[.06] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400/80" />
              <span className="text-xs font-semibold text-gray-400 tracking-wide">Transcripción en vivo</span>
            </div>
            {transcript.length > 0 && (
              <span className="text-[10px] text-gray-600 tabular-nums">{transcript.length} mensajes</span>
            )}
          </div>

          <div
            ref={transcriptRef}
            className="flex-1 overflow-y-auto p-5 space-y-3 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(99,102,241,.06),transparent)]"
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
                <p className="text-sm text-gray-500 font-medium">Sin conversación aún</p>
                <p className="text-xs text-gray-600 mt-1.5 max-w-xs leading-relaxed">
                  {isActive
                    ? "Lia saludará primero. Luego habla con naturalidad — aquí verás la transcripción."
                    : "Inicia la sesión para probar tu agente de voz con datos reales."}
                </p>
              </div>
            ) : (
              transcript.map((line, i) => (
                <div key={i} className={`flex ${line.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed ${
                    line.role === "user"
                      ? "bg-violet-600/15 border border-violet-500/20 text-gray-100 rounded-br-md"
                      : "bg-white/[.03] border border-white/[.07] text-gray-200 rounded-bl-md"
                  }`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${
                      line.role === "user" ? "text-violet-400/90" : "text-gray-500"
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
                        className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-bounce"
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
    </div>
  );
}
