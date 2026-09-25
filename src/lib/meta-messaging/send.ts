import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto/token-cipher";
import { metaGraphBaseUrl } from "@/lib/meta/graph-config";
import type { MetaMessagingChannelRecord, MetaMessagingPlatform } from "@/lib/meta-messaging/types";

/**
 * Envío por la Send API de Meta (Messenger e Instagram usan el mismo endpoint
 * con el token de la página). Reglas de Meta:
 *  - Dentro de 24 h desde el último mensaje del cliente: cualquier respuesta.
 *  - De 24 h a 7 días: solo un humano, con la etiqueta HUMAN_AGENT.
 *  - Después de 7 días: no se puede escribir hasta que el cliente vuelva a escribir.
 */

const STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000;
const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Límite de caracteres por mensaje de texto en cada plataforma. */
const TEXT_LIMIT: Record<MetaMessagingPlatform, number> = { messenger: 2000, instagram: 1000 };

export type MetaSendWindow = "standard" | "human_agent" | "closed";

export function metaSendWindow(lastInboundAt: string | null | undefined, now = Date.now()): MetaSendWindow {
  const t = lastInboundAt ? Date.parse(lastInboundAt) : NaN;
  if (!Number.isFinite(t)) return "closed";
  const elapsed = now - t;
  if (elapsed <= STANDARD_WINDOW_MS) return "standard";
  if (elapsed <= HUMAN_AGENT_WINDOW_MS) return "human_agent";
  return "closed";
}

/** Parte un texto largo en trozos que respeten el límite, cortando en saltos de línea o espacios. */
export function splitMetaMessage(platform: MetaMessagingPlatform, body: string): string[] {
  const limit = TEXT_LIMIT[platform];
  const parts: string[] = [];
  let rest = body.trim();
  while (rest.length > limit) {
    const slice = rest.slice(0, limit);
    const cut = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    const at = cut > limit * 0.5 ? cut : limit;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

async function postSendApi(
  channel: MetaMessagingChannelRecord,
  payload: Record<string, unknown>
): Promise<string | null> {
  const token = decryptToken(channel.page_access_token_enc);
  const res = await fetch(`${metaGraphBaseUrl()}/${channel.page_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const json = (await res.json().catch(() => ({}))) as {
    message_id?: string;
    error?: { message?: string; code?: number };
  };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Meta Send API error ${res.status}`);
  }
  return json.message_id ?? null;
}

/**
 * Meta devuelve cada mensaje enviado como webhook "echo". Instagram no siempre
 * trae el app_id, así que se registra el mid en la tabla de dedup: cuando llega
 * el echo, el webhook lo descarta como repetido en vez de tomarlo por una
 * respuesta escrita a mano desde Meta Business Suite.
 */
async function markSentAsSeen(db: SupabaseClient | undefined, messageId: string | null): Promise<void> {
  if (!db || !messageId) return;
  const { error } = await db.from("meta_messaging_inbound_dedup").insert({ message_id: messageId });
  if (error && error.code !== "23505") console.warn("[meta-messaging] dedup envío:", error.message);
}

export async function sendMetaTextMessage(input: {
  db?: SupabaseClient;
  channel: MetaMessagingChannelRecord;
  contactId: string;
  body: string;
  /** Respuesta de un asesor fuera de las 24 h (hasta 7 días). */
  humanAgentTag?: boolean;
}): Promise<{ sentCount: number }> {
  const parts = splitMetaMessage(input.channel.platform, input.body);
  for (const text of parts) {
    const messageId = await postSendApi(input.channel, {
      recipient: { id: input.contactId },
      message: { text },
      ...(input.humanAgentTag
        ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }
        : { messaging_type: "RESPONSE" })
    });
    await markSentAsSeen(input.db, messageId);
  }
  return { sentCount: parts.length };
}

/** "Escribiendo…" mientras la IA genera. Best-effort: nunca lanza. */
export async function sendMetaTypingOn(channel: MetaMessagingChannelRecord, contactId: string): Promise<void> {
  try {
    await postSendApi(channel, { recipient: { id: contactId }, sender_action: "typing_on" });
  } catch (err) {
    console.warn("[meta-messaging] typing:", err instanceof Error ? err.message : err);
  }
}
