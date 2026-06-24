import { pipecatMediaStreamWsUrl, telephonyBridgeMode, telnyxMediaStreamWsUrl, telnyxStreamUrl } from "@/lib/telephony/app-url";

function apiKey(): string {
  const key = process.env.TELNYX_API_KEY?.trim();
  if (!key) throw new Error("TELNYX_API_KEY no configurado");
  return key;
}

async function telnyxJson<T>(path: string, init?: RequestInit & { json?: Record<string, unknown> }): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey()}`,
    Accept: "application/json"
  };

  let body: string | undefined;
  if (init?.json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  const res = await fetch(`https://api.telnyx.com/v2${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    body: body ?? init?.body
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errs = data.errors as { detail?: string }[] | undefined;
    throw new Error(errs?.[0]?.detail || `Telnyx ${path} falló (${res.status})`);
  }
  return data as T;
}

function outboundProfileId(): string | null {
  return process.env.TELNYX_OUTBOUND_VOICE_PROFILE_ID?.trim() || null;
}

async function resolveOutboundProfileId(): Promise<string | null> {
  const fromEnv = outboundProfileId();
  if (fromEnv) return fromEnv;

  const data = await telnyxJson<{ data: { id: string; enabled?: boolean }[] }>("/outbound_voice_profiles");
  const profile = (data.data ?? []).find(p => p.enabled !== false);
  return profile?.id ?? null;
}

/** Asigna Outbound Voice Profile a la Call Control App si falta (error D38). */
export async function ensureTelnyxOutboundProfile(connectionId: string): Promise<void> {
  const profileId = await resolveOutboundProfileId();
  if (!profileId) return;

  const app = await telnyxJson<{
    data: { outbound?: { outbound_voice_profile_id?: string | null } };
  }>(`/call_control_applications/${connectionId}`);

  if (app.data?.outbound?.outbound_voice_profile_id) return;

  await telnyxJson(`/call_control_applications/${connectionId}`, {
    method: "PATCH",
    json: { outbound: { outbound_voice_profile_id: profileId } }
  });
}

/** Acciones Call Control de Telnyx para atender llamadas entrantes. */
export async function telnyxCallAction(
  callControlId: string,
  action: string,
  json?: Record<string, unknown>
): Promise<void> {
  await telnyxJson(`/calls/${callControlId}/actions/${action}`, {
    method: "POST",
    ...(json ? { json } : {})
  });
}

export async function answerAndSpeak(
  callControlId: string,
  text: string
): Promise<void> {
  await telnyxCallAction(callControlId, "answer");
  await telnyxCallAction(callControlId, "speak", {
    payload: text,
    voice: "AWS.Polly.Lupe-Neural",
    language: "es-CO",
    payload_type: "text"
  });
}

export async function speakText(callControlId: string, text: string): Promise<void> {
  const primary = {
    payload: text,
    voice: "AWS.Polly.Lupe-Neural",
    language: "es-CO",
    payload_type: "text"
  };
  const fallback = {
    payload: text,
    voice: "female",
    language: "es-CO",
    payload_type: "text"
  };
  try {
    await telnyxCallAction(callControlId, "speak", primary);
  } catch {
    await telnyxCallAction(callControlId, "speak", fallback);
  }
}

export async function telnyxHangup(callControlId: string): Promise<void> {
  await telnyxCallAction(callControlId, "hangup");
}

export async function telnyxStartMediaStream(callControlId: string, streamUrl: string): Promise<void> {
  const pipecat = telephonyBridgeMode() === "pipecat";

  // Pipecat TelnyxFrameSerializer solo soporta PCMU/PCMA (8 kHz), no L16.
  const json = pipecat
    ? {
        stream_url: streamUrl,
        // Solo voz del usuario hacia Pipecat (evita eco del track outbound).
        stream_track: "inbound_track",
        stream_codec: "PCMU",
        stream_bidirectional_mode: "rtp",
        stream_bidirectional_codec: "PCMU",
        // "opposite" no reproduce audio en el celular en llamadas salientes.
        stream_bidirectional_target_legs: "both"
      }
    : {
        stream_url: streamUrl,
        stream_track: "both_tracks",
        stream_codec: "PCMU",
        stream_bidirectional_mode: "rtp",
        stream_bidirectional_codec: "PCMU",
        stream_bidirectional_target_legs: "both"
      };

  await telnyxJson(`/calls/${callControlId}/actions/streaming_start`, {
    method: "POST",
    json
  });
}

export async function telnyxPlaceCall(params: {
  connectionId: string;
  from: string;
  to: string;
  clientState?: Record<string, unknown>;
}): Promise<{ callControlId: string }> {
  await ensureTelnyxOutboundProfile(params.connectionId);

  const body: Record<string, unknown> = {
    connection_id: params.connectionId,
    from: params.from,
    to: params.to,
    timeout_secs: 45
  };
  if (params.clientState) {
    body.client_state = Buffer.from(JSON.stringify(params.clientState)).toString("base64");
  }

  const data = await telnyxJson<{ data?: { call_control_id?: string } }>("/calls", {
    method: "POST",
    json: body
  });

  const callControlId = data.data?.call_control_id;
  if (!callControlId) throw new Error("Telnyx no devolvió call_control_id");
  return { callControlId };
}
