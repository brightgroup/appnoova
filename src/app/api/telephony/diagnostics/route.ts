import { NextResponse } from "next/server";
import { GoogleGenAI, type LiveServerMessage } from "@google/genai";
import { buildGeminiLiveSessionConfig } from "@/lib/gemini-live-config";
import { getVoiceGoogleApiKey } from "@/lib/google-ai";
import {
  getAppBaseUrl,
  pipecatMediaStreamWsUrl,
  telephonyBridgeMode,
  telnyxMediaStreamWsUrl,
  telnyxStreamUrl
} from "@/lib/telephony/app-url";
import { getPipecatInternalSecret } from "@/lib/telephony/pipecat-auth";
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
      config: buildGeminiLiveSessionConfig({
        systemInstruction: "Responde brevemente en español.",
        voiceName: "Kore",
        temperature: 1.0,
      }),
      callbacks: {
        onmessage: (msg: LiveServerMessage) => {
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

async function probePipecatReachable(): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = pipecatMediaStreamWsUrl();
  if (!url) return { ok: false, error: "no_pipecat_url" };
  const httpUrl = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/ws\/?$/, "/");
  try {
    const res = await fetch(httpUrl, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000) });
    // 307/404/200 = el host responde; solo importa que no sea timeout/DNS.
    if (res.status >= 200 && res.status < 500) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: `http_${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unreachable" };
  }
}

/** GET — diagnóstico telefonía (sin secretos). */
export async function GET() {
  const telnyx = telnyxConfigStatus();
  const geminiLive = await probeGeminiLive();
  const pipecatReach = await probePipecatReachable();
  const bridgeMode = telephonyBridgeMode();
  return NextResponse.json({
    app_url: getAppBaseUrl(),
    bridge_mode: bridgeMode,
    media_stream_ws: telnyxStreamUrl(),
    media_stream_ws_diy: telnyxMediaStreamWsUrl(),
    media_stream_ws_pipecat: pipecatMediaStreamWsUrl(),
    pipecat_reachable: pipecatReach.ok,
    pipecat_reachable_status: pipecatReach.status,
    pipecat_reachable_error: pipecatReach.error,
    pipecat_internal_secret: Boolean(getPipecatInternalSecret()),
    telnyx_configured: telnyx.configured,
    telnyx_has_connection: telnyx.has_connection,
    google_voice_key: Boolean(getVoiceGoogleApiKey()),
    gemini_live_ok: geminiLive.ok,
    gemini_live_ms: geminiLive.ms,
    gemini_live_error: geminiLive.error,
    gemini_live_scope:
      bridgeMode === "pipecat"
        ? "nodejs_sdk_probe_only — Gemini en llamadas Google corre en el servicio Pipecat (Python), no en esta app"
        : "nodejs_diy_bridge",
    pipecat_env_checklist: [
      "GOOGLE_API_KEY o GOOGLE_AI_KEY en el servicio Pipecat (voice.*), no solo en app.noova360.com",
      "PIPECAT_INTERNAL_SECRET igual en app y Pipecat",
      "NOOVA_APP_URL=https://app.noova360.com en Pipecat",
      "Redeploy del servicio Pipecat tras cambios en bot.py",
    ],
    server_mode: bridgeMode === "pipecat" ? "pipecat_self_hosted" : "custom_ws_server",
    start_command: bridgeMode === "pipecat"
      ? "Noova: npm start | Pipecat: python services/pipecat-voice/bot.py"
      : "npm start (tsx server.ts)"
  });
}
