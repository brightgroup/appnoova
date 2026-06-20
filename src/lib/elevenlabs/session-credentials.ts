import { elevenLabsFetch } from "@/lib/elevenlabs/client";

/** Token WebRTC para voz en navegador (agentes privados). */
export async function getElevenLabsConversationToken(agentId: string): Promise<string> {
  const data = await elevenLabsFetch<{ token?: string }>(
    `/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`
  );
  const token = data.token?.trim();
  if (!token) throw new Error("No se pudo obtener token de sesión premium");
  return token;
}

/** Signed URL (WebSocket — solo uso legacy, no prueba web premium). */
export async function getElevenLabsSignedUrl(agentId: string): Promise<string> {
  const data = await elevenLabsFetch<{ signed_url?: string }>(
    `/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`
  );
  const url = data.signed_url?.trim();
  if (!url) throw new Error("No se pudo obtener URL de sesión premium");
  return url;
}

/** WebRTC token — mismo camino que el widget ElevenLabs (sin fallback WebSocket). */
export async function getElevenLabsWebSessionCredentials(
  agentId: string
): Promise<{ conversationToken: string }> {
  return { conversationToken: await getElevenLabsConversationToken(agentId) };
}
