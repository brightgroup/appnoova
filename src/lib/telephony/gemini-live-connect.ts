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

function buildCallbacks(target: GeminiLiveCallbacks) {
  return {
    onmessage: (msg: LiveServerMessage) => target.onmessage(msg),
    onerror: (e: unknown) => target.onerror(e),
    onclose: (e?: { code?: number; reason?: string }) => {
      target.onclose(e?.code, e?.reason);
    }
  };
}

/** Conecta Gemini Live desde el servidor WS (server.ts), no desde rutas Next.js. */
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
