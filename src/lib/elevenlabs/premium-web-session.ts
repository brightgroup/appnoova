import type { DisconnectionDetails } from "@elevenlabs/client";

/** Respuesta mínima del endpoint de sesión web — alineada con el widget ElevenLabs. */
export interface PremiumWebSessionPayload {
  conversationToken: string;
  dynamicVariables: Record<string, string>;
  promptOverride?: string;
}

export function parsePremiumWebSessionPayload(
  data: Record<string, unknown>
): PremiumWebSessionPayload {
  const conversationToken = String(data.conversationToken ?? "").trim();
  if (!conversationToken) {
    throw new Error("missing_conversation_token");
  }
  const raw = data.dynamicVariables;
  const dynamicVariables =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, string>)
      : {};
  const promptOverride =
    typeof data.promptOverride === "string" && data.promptOverride.trim()
      ? data.promptOverride.trim()
      : undefined;
  return { conversationToken, dynamicVariables, promptOverride };
}

export async function fetchPremiumWebSession(
  voiceAgentId: string,
  headers: HeadersInit
): Promise<PremiumWebSessionPayload> {
  const res = await fetch(
    `/api/voice/agents/elevenlabs/session?voice_agent_id=${encodeURIComponent(voiceAgentId)}`,
    { headers }
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(String(data.error ?? "session_failed")) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = typeof data.code === "string" ? data.code : undefined;
    throw err;
  }
  return parsePremiumWebSessionPayload(data);
}

export function premiumDisconnectReason(
  details: DisconnectionDetails,
  userInitiated: boolean
): string {
  if (userInitiated || details.reason === "user") return "User Ended";
  if (details.reason === "agent") return "Agent Hangup";
  return "Connection Ended";
}
