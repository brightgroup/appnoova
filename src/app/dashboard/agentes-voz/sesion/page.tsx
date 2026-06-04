"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Mic, MicOff, PhoneOff, Loader2, ChevronLeft, Volume2 } from "lucide-react";
import Link from "next/link";
import { GoogleGenAI, Modality, type Session, type LiveServerMessage } from "@google/genai";
import { VOICE_AGENT_TEMPLATES } from "@/lib/voice-agent-templates";

const PROMPTS = VOICE_AGENT_TEMPLATES;

const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

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
  const template = params.get("template") || "lead-qualification";
  const info     = PROMPTS[template] ?? PROMPTS["lead-qualification"];

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

  const stopSession = useCallback(() => {
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
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
          },
          thinkingConfig: {
            includeThoughts: false,
            thinkingBudget: 0
          },
          systemInstruction: info.prompt,
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
      stopSession();
    }
  }, [info.prompt, handleServerMessage, stopSession]);

  useEffect(() => () => stopSession(), [stopSession]);

  const isConnecting = state === "connecting";
  const isActive = state === "listening" || state === "thinking" || state === "speaking";

  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white min-h-screen">

      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/agentes-voz" className="p-1.5 hover:bg-white/[.08] rounded-lg transition-colors text-gray-400 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-base font-bold">{info.name}</h1>
            <p className="text-xs text-gray-500">Sesión de prueba · Gemini Live</p>
          </div>
        </div>

        {(isActive || isConnecting) && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-semibold text-green-400">{formatTime(duration)}</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex gap-0 overflow-hidden">

        <div className="w-80 border-r border-white/[.08] flex flex-col p-6">

          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              {state === "speaking" && (
                <>
                  <div className="absolute inset-0 rounded-full border-2 border-violet-400/40 animate-ping scale-110" />
                  <div className="absolute inset-0 rounded-full border-2 border-violet-400/20 animate-ping scale-125" style={{ animationDelay: "0.3s" }} />
                </>
              )}
              <div className={`w-24 h-24 rounded-full flex items-center justify-center bg-gradient-to-br ${info.color} shadow-2xl`}>
                <span className="text-3xl font-bold text-white">L</span>
              </div>
            </div>

            <p className="text-sm font-semibold text-white mb-1">Lia</p>
            <p className="text-xs text-gray-500 text-center">
              {state === "idle"       && "Lista para iniciar"}
              {state === "connecting" && (statusHint || "Conectando...")}
              {state === "listening"  && "Escuchando..."}
              {state === "thinking"   && "Procesando..."}
              {state === "speaking"   && "Hablando..."}
              {state === "error"      && "Error de conexión"}
            </p>
          </div>

          <div className="space-y-3">
            {!isActive && !isConnecting ? (
              <button
                onClick={startSession}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all bg-gradient-to-r ${info.color} text-white hover:opacity-90 shadow-lg`}
              >
                <Mic className="w-4 h-4" /> Iniciar sesión
              </button>
            ) : isConnecting ? (
              <button
                disabled
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all bg-gradient-to-r ${info.color} text-white opacity-70 cursor-not-allowed shadow-lg`}
              >
                <Loader2 className="w-4 h-4 animate-spin" /> Conectando...
              </button>
            ) : (
              <>
                <button
                  onClick={() => setMuted(m => !m)}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all border ${
                    muted
                      ? "bg-red-500/10 border-red-500/30 text-red-400"
                      : "bg-white/[.04] border-white/[.10] text-white hover:bg-white/[.08]"
                  }`}
                >
                  {muted ? <><MicOff className="w-4 h-4" /> Micrófono silenciado</> : <><Mic className="w-4 h-4" /> Micrófono activo</>}
                </button>
                <button
                  onClick={stopSession}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
                >
                  <PhoneOff className="w-4 h-4" /> Terminar sesión
                </button>
              </>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/[.07] border border-red-500/20 text-xs text-red-400 leading-relaxed">
              {error}
            </div>
          )}

          <div className="mt-auto pt-6 border-t border-white/[.06]">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Modelo</p>
            <p className="text-xs text-gray-400 font-mono break-all">{LIVE_MODEL}</p>
            <p className="text-[10px] text-gray-600 mt-1">Voz: Aoede · Español</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="px-6 py-3 border-b border-white/[.06] flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Transcripción en vivo</span>
          </div>

          <div ref={transcriptRef} className="flex-1 overflow-auto p-6 space-y-4">
            {transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full bg-white/[.03] border border-white/[.08] flex items-center justify-center mb-4">
                  <Volume2 className="w-7 h-7 text-gray-600" />
                </div>
                <p className="text-gray-600 text-sm">La transcripción aparecerá aquí durante la sesión</p>
                {isActive && (
                  <p className="text-gray-500 text-xs mt-2">Lia saludará primero — luego puedes hablar</p>
                )}
              </div>
            ) : (
              transcript.map((line, i) => (
                <div key={i} className={`flex ${line.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    line.role === "user"
                      ? "bg-violet-600/20 border border-violet-500/20 text-white"
                      : "bg-white/[.04] border border-white/[.08] text-gray-200"
                  }`}>
                    <p className={`text-[10px] font-semibold mb-1 ${line.role === "user" ? "text-violet-400" : "text-gray-500"}`}>
                      {line.role === "user" ? "Tú" : "Lia"}
                    </p>
                    {line.text}
                  </div>
                </div>
              ))
            )}

            {state === "thinking" && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl bg-white/[.04] border border-white/[.08]">
                  <div className="flex gap-1.5 items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
