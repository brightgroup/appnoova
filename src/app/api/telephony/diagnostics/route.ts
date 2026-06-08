import { NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import { getVoiceGoogleApiKey } from "@/lib/google-ai";
import { getAppBaseUrl, telnyxMediaStreamWsUrl } from "@/lib/telephony/app-url";
import { telnyxConfigStatus } from "@/lib/telephony/telnyx-provider";
import { DEFAULT_LIVE_MODEL } from "@/lib/voice-agent-options";

async function probeGeminiLive(): Promise<{ ok: boolean; ms?: number; error?: string }> {
  const apiKey = getVoiceGoogleApiKey();
  if (!apiKey) return { ok: false, error: "no_api_key" };

  const started = Date.now();
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ ok: false, error: "timeout" }), 8000);
    const ai = new GoogleGenAI({ apiKey });
    void ai.live.connect({
      model: DEFAULT_LIVE_MODEL,
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onmessage: msg => {
          if (msg.setupComplete) {
            clearTimeout(timer);
            resolve({ ok: true, ms: Date.now() - started });
          }
        },
        onerror: e => {
          clearTimeout(timer);
          const msg = e && typeof e === "object" && "message" in e
            ? String((e as { message?: unknown }).message)
            : String(e);
          resolve({ ok: false, error: msg || "gemini_error" });
        },
        onclose: e => {
          clearTimeout(timer);
          resolve({ ok: false, error: `closed_${e?.code ?? "unknown"}` });
        }
      }
    }).catch(e => {
      clearTimeout(timer);
      resolve({ ok: false, error: e instanceof Error ? e.message : "connect_failed" });
    });
  });
}

/** GET — diagnóstico telefonía (sin secretos). */
export async function GET() {
  const telnyx = telnyxConfigStatus();
  const geminiLive = await probeGeminiLive();
  return NextResponse.json({
    app_url: getAppBaseUrl(),
    media_stream_ws: telnyxMediaStreamWsUrl(),
    telnyx_configured: telnyx.configured,
    telnyx_has_connection: telnyx.has_connection,
    google_voice_key: Boolean(getVoiceGoogleApiKey()),
    gemini_live_ok: geminiLive.ok,
    gemini_live_ms: geminiLive.ms,
    gemini_live_error: geminiLive.error,
    server_mode: "custom_ws_server",
    start_command: "npm start (tsx server.ts)"
  });
}
