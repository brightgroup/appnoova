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

/**
 * Prueba el host de Pipecat con dos probes:
 * 1. GET en la raíz (host vivo)
 * 2. GET en el path /ws exacto (¿devuelve 400 o 101 sin Upgrade? — cualquier respuesta HTTP significa que el WS path existe)
 * Nota: un 307 en la raíz es normal (redirect HTTP→HTTPS de Traefik).
 *       Un 307/301 en /ws indica que el WS está siendo redirigido y Telnyx no lo alcanzará.
 */
async function probePipecatReachable(): Promise<{
  ok: boolean;
  root_status?: number;
  ws_path_status?: number;
  ws_path_redirected?: boolean;
  error?: string;
}> {
  const wsUrl = pipecatMediaStreamWsUrl();
  if (!wsUrl) return { ok: false, error: "no_pipecat_url" };

  const httpBase = wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

  // Probe 1: raíz del host (solo para saber si está vivo)
  const rootUrl = httpBase.replace(/\/ws\/?$/, "/").replace(/\/+$/, "/");
  let rootStatus: number | undefined;
  try {
    const r = await fetch(rootUrl, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000) });
    rootStatus = r.status;
  } catch {
    return { ok: false, error: "host_unreachable" };
  }

  // Probe 2: el path /ws exacto que usa Telnyx (sin Upgrade header → debe devolver 400 "Bad Request" o 200, NO 30x)
  const wsHttpUrl = httpBase.endsWith("/ws") ? httpBase : httpBase.replace(/\/?$/, "/ws");
  let wsPathStatus: number | undefined;
  try {
    const r = await fetch(wsHttpUrl, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000) });
    wsPathStatus = r.status;
  } catch {
    wsPathStatus = undefined;
  }

  const wsPathRedirected = wsPathStatus !== undefined && wsPathStatus >= 300 && wsPathStatus < 400;

  // Si /ws devuelve un redirect, Telnyx no podrá abrir el WebSocket.
  if (wsPathRedirected) {
    return { ok: false, root_status: rootStatus, ws_path_status: wsPathStatus, ws_path_redirected: true, error: `ws_path_redirects_${wsPathStatus}` };
  }

  // Un host respondiendo (incluso 400 en /ws) es señal de que el path existe.
  if (rootStatus >= 200 && rootStatus < 600) {
    return { ok: true, root_status: rootStatus, ws_path_status: wsPathStatus, ws_path_redirected: false };
  }

  return { ok: false, root_status: rootStatus, error: `host_error_${rootStatus}` };
}

/** Verifica que el endpoint bridge-config (que Pipecat llama en cada llamada) responde correctamente. */
async function probePipecatBridgeConfig(): Promise<{ ok: boolean; status?: number; error?: string }> {
  const secret = getPipecatInternalSecret();
  if (!secret) return { ok: false, error: "no_pipecat_secret_in_app" };

  const appUrl = getAppBaseUrl();
  const url = `${appUrl}/api/telephony/bridge-config?call_control_id=__diag_probe__`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(5000)
    });
    // 404 = auth OK pero call_control_id no existe → el endpoint funciona.
    // 401 = el secret no coincide en el servidor (bug de config).
    // 200 = no debería pasar con un ID falso.
    if (res.status === 404 || res.status === 200) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: res.status === 401 ? "auth_mismatch" : `http_${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unreachable" };
  }
}

/** GET — diagnóstico telefonía (sin secretos). */
export async function GET() {
  const telnyx = telnyxConfigStatus();
  const bridgeMode = telephonyBridgeMode();

  const [geminiLive, pipecatReach, pipecatBridgeCfg] = await Promise.all([
    probeGeminiLive(),
    probePipecatReachable(),
    bridgeMode === "pipecat" ? probePipecatBridgeConfig() : Promise.resolve(null),
  ]);

  const wsPathOk = pipecatReach.ws_path_status !== undefined
    ? !pipecatReach.ws_path_redirected && pipecatReach.ws_path_status < 500
    : null;

  return NextResponse.json({
    app_url: getAppBaseUrl(),
    bridge_mode: bridgeMode,
    media_stream_ws: telnyxStreamUrl(),
    media_stream_ws_diy: telnyxMediaStreamWsUrl(),
    media_stream_ws_pipecat: pipecatMediaStreamWsUrl(),
    // Host del servicio Pipecat
    pipecat_host_reachable: pipecatReach.ok,
    pipecat_root_status: pipecatReach.root_status,
    // Path /ws que usa Telnyx — si está redirigido (30x), Telnyx no puede conectar
    pipecat_ws_path_status: pipecatReach.ws_path_status,
    pipecat_ws_path_ok: wsPathOk,
    pipecat_ws_path_redirected: pipecatReach.ws_path_redirected ?? null,
    pipecat_host_error: pipecatReach.error ?? null,
    // Auth interna: Pipecat llama a este endpoint en cada llamada
    pipecat_bridge_config_ok: pipecatBridgeCfg?.ok ?? null,
    pipecat_bridge_config_status: pipecatBridgeCfg?.status ?? null,
    pipecat_bridge_config_error: pipecatBridgeCfg?.error ?? null,
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
    // Checklist para el servicio Pipecat en Coolify
    pipecat_service_checklist: {
      "1_env_vars_required": {
        PIPECAT_INTERNAL_SECRET: "mismo valor que en la app Noova",
        NOOVA_APP_URL: "https://app.noova360.com",
        TELNYX_API_KEY: "mismo valor que en la app Noova",
        GOOGLE_API_KEY: "opcional — la app lo propaga si está vacío (redeploy pipecat para activar)"
      },
      "2_ws_path": "El path /ws debe devolver 400 (sin redirect) cuando Telnyx conecta sin header Upgrade",
      "3_redeploy": "Redeploy del servicio Pipecat en Coolify tras cada cambio en bot.py"
    },
    server_mode: bridgeMode === "pipecat" ? "pipecat_self_hosted" : "custom_ws_server",
  });
}
