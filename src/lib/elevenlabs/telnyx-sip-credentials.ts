/** Resuelve credenciales SIP Telnyx para ElevenLabs (env o API Telnyx). */

interface TelnyxCredentialConnection {
  id: string;
  user_name: string;
  password?: string;
  active?: boolean;
  outbound?: { outbound_voice_profile_id?: string | null };
}

let cachedCredentials: { username: string; password: string; connectionId: string } | null = null;

async function telnyxAdminFetch<T>(
  path: string,
  init?: RequestInit & { json?: Record<string, unknown> }
): Promise<T> {
  const key = process.env.TELNYX_API_KEY?.trim();
  if (!key) throw new Error("TELNYX_API_KEY no configurado");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };

  let body: string | undefined;
  if (init?.json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  const res = await fetch(`https://api.telnyx.com/v2${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    body: body ?? init?.body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errs = json.errors as { detail?: string; title?: string }[] | undefined;
    const msg = errs?.[0]?.detail || errs?.[0]?.title || res.statusText;
    throw new Error(`Telnyx: ${msg}`);
  }
  return json as T;
}

function outboundProfileId(): string | null {
  return (
    process.env.TELNYX_OUTBOUND_VOICE_PROFILE_ID?.trim()
    || process.env.TELNYX_SIP_OUTBOUND_VOICE_PROFILE_ID?.trim()
    || null
  );
}

async function resolveOutboundVoiceProfileId(): Promise<string | null> {
  const fromEnv = outboundProfileId();
  if (fromEnv) return fromEnv;

  const connectionId = process.env.TELNYX_CONNECTION_ID?.trim();
  if (!connectionId || !process.env.TELNYX_API_KEY?.trim()) return null;

  try {
    const res = await telnyxAdminFetch<{
      data?: { outbound?: { outbound_voice_profile_id?: string | null } };
    }>(`/call_control_applications/${connectionId}`);
    return res.data?.outbound?.outbound_voice_profile_id?.trim() || null;
  } catch {
    return null;
  }
}

async function loadCredentialConnection(connectionId: string): Promise<TelnyxCredentialConnection> {
  const res = await telnyxAdminFetch<{ data: TelnyxCredentialConnection }>(
    `/credential_connections/${connectionId}`
  );
  return res.data;
}

async function pickCredentialConnectionId(): Promise<string> {
  const explicit = process.env.TELNYX_SIP_CONNECTION_ID?.trim();
  if (explicit) return explicit;

  const list = await telnyxAdminFetch<{ data: TelnyxCredentialConnection[] }>(
    "/credential_connections?page[size]=20"
  );
  const active = (list.data ?? []).filter(c => c.active !== false);
  if (active.length === 0) {
    throw new Error(
      "No hay SIP Credential Connection en Telnyx — crea una en Mission Control → SIP Connections"
    );
  }
  return active[0].id;
}

/** Asegura que la conexión SIP tenga perfil saliente (requerido para outbound vía ElevenLabs). */
async function ensureOutboundVoiceProfile(connection: TelnyxCredentialConnection): Promise<void> {
  const profileId = await resolveOutboundVoiceProfileId();
  if (!profileId || connection.outbound?.outbound_voice_profile_id) return;

  await telnyxAdminFetch(`/credential_connections/${connection.id}`, {
    method: "PATCH",
    json: {
      outbound: {
        outbound_voice_profile_id: profileId,
      },
    },
  });
}

/** Credenciales digest Telnyx para trunk ElevenLabs → sip.telnyx.com */
export async function resolveTelnyxSipCredentials(): Promise<{
  username: string;
  password: string;
  connectionId: string;
} | null> {
  const envUser = process.env.ELEVENLABS_SIP_USERNAME?.trim();
  const envPass = process.env.ELEVENLABS_SIP_PASSWORD?.trim();
  if (envUser && envPass) {
    return {
      username: envUser,
      password: envPass,
      connectionId: process.env.TELNYX_SIP_CONNECTION_ID?.trim() || "env",
    };
  }

  if (!process.env.TELNYX_API_KEY?.trim()) return null;
  if (cachedCredentials) return cachedCredentials;

  const connectionId = await pickCredentialConnectionId();
  let connection = await loadCredentialConnection(connectionId);
  await ensureOutboundVoiceProfile(connection);
  connection = await loadCredentialConnection(connectionId);

  const username = connection.user_name?.trim();
  const password = connection.password?.trim();
  if (!username || !password) {
    throw new Error(
      "Telnyx no devolvió credenciales SIP — define ELEVENLABS_SIP_USERNAME y ELEVENLABS_SIP_PASSWORD"
    );
  }

  cachedCredentials = { username, password, connectionId };
  return cachedCredentials;
}

export function clearTelnyxSipCredentialsCache(): void {
  cachedCredentials = null;
}
