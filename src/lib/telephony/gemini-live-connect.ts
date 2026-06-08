import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { getVoiceGoogleApiKey } from "@/lib/google-ai";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import { DEFAULT_LIVE_MODEL } from "@/lib/voice-agent-options";
import { geminiTemperature } from "@/lib/voice-agent-audio";
import type { PendingBridgeSession } from "@/lib/telephony/bridge-session-store";

export interface GeminiLiveCallbacks {
  onmessage: (msg: LiveServerMessage) => void;
  onerror: (err: unknown) => void;
  onclose: (code?: number, reason?: string) => void;
}

const prewarm = new Map<string, { promise: Promise<Session | null>; callbacks: GeminiLiveCallbacks }>();

function buildCallbacks(target: GeminiLiveCallbacks) {
  return {
    onmessage: (msg: LiveServerMessage) => target.onmessage(msg),
    onerror: (e: unknown) => target.onerror(e),
    onclose: (e?: { code?: number; reason?: string }) => {
      target.onclose(e?.code, e?.reason);
    }
  };
}

export async function connectGeminiLive(
  pending: PendingBridgeSession,
  callbacks: GeminiLiveCallbacks
): Promise<Session | null> {
  const apiKey = getVoiceGoogleApiKey();
  if (!apiKey) {
    console.error("[telnyx-gemini] Sin GOOGLE_AI_KEY / NEXT_PUBLIC_GOOGLE_AI_KEY");
    return null;
  }

  const cfg = pending.config;
  const ai = new GoogleGenAI({ apiKey });
  const model = cfg.model || DEFAULT_LIVE_MODEL;

  console.info("[telnyx-gemini] conectando", {
    callControlId: pending.callControlId,
    model,
    agent: pending.agentName
  });

  try {
    const session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice_name || "Aoede" } }
        },
        thinkingConfig: { includeThoughts: false, thinkingBudget: 0 },
        temperature: geminiTemperature(cfg.temperature),
        systemInstruction: `${mergeCompanyContext(cfg.prompt, pending.companyContextText)}

Al iniciar la llamada, saluda con UNA sola frase breve en español colombiano y luego espera en silencio a que el usuario hable. No continúes hablando hasta que el usuario responda.
Si el usuario se despide o indica que quiere terminar la conversación, despídete de forma breve y cordial (máximo una oración).`,
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      },
      callbacks: buildCallbacks(callbacks)
    });
    console.info("[telnyx-gemini] socket abierto", { callControlId: pending.callControlId });
    return session;
  } catch (e) {
    console.error("[telnyx-gemini] connect failed:", e);
    return null;
  }
}

/** Inicia Gemini Live en paralelo al streaming_start de Telnyx. */
export function scheduleGeminiPrewarm(pending: PendingBridgeSession): void {
  if (prewarm.has(pending.callControlId)) return;

  const callbacks: GeminiLiveCallbacks = {
    onmessage: () => {},
    onerror: () => {},
    onclose: () => {}
  };

  const promise = connectGeminiLive(pending, callbacks);
  prewarm.set(pending.callControlId, { promise, callbacks });
  console.info("[telnyx-gemini] prewarm iniciado", { callControlId: pending.callControlId });
}

/** Reutiliza sesión pre-calentada y enlaza callbacks del puente activo. */
export async function takePrewarmedGemini(
  callControlId: string,
  callbacks: GeminiLiveCallbacks
): Promise<Session | null> {
  const entry = prewarm.get(callControlId);
  if (!entry) return null;

  prewarm.delete(callControlId);
  entry.callbacks.onmessage = callbacks.onmessage;
  entry.callbacks.onerror = callbacks.onerror;
  entry.callbacks.onclose = callbacks.onclose;

  const session = await entry.promise;
  if (session) {
    console.info("[telnyx-gemini] prewarm reutilizado", { callControlId });
  }
  return session;
}

export function cancelGeminiPrewarm(callControlId: string): void {
  prewarm.delete(callControlId);
}
