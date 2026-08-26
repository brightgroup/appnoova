import type { SupabaseClient } from "@supabase/supabase-js";
import { hubspotFetchJson } from "@/lib/hubspot/client";
import type { HubspotConnectionSecrets } from "@/lib/hubspot/connections-db";

export interface HubspotThreadMessage {
  id: string;
  type: string;
  direction: "INCOMING" | "OUTGOING" | string;
  text: string | null;
  conversationsThreadId: string;
  channelId: string | null;
  channelAccountId: string | null;
  senders: { deliveryIdentifier?: { type: string; value: string }; name?: string | null }[];
}

export interface HubspotThread {
  id: string;
  inboxId: string;
  assignedTo: string | null;
}

export interface HubspotInbox {
  id: string;
  name: string;
}

/** Trae un mensaje puntual de un hilo — equivale al nodo "trae datos de conversación" del flujo de n8n. */
export async function getMessage(
  db: SupabaseClient,
  conn: HubspotConnectionSecrets,
  threadId: string,
  messageId: string
): Promise<HubspotThreadMessage> {
  return hubspotFetchJson<HubspotThreadMessage>(
    db,
    conn,
    `/conversations/v3/conversations/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`
  );
}

/** Metadatos del hilo — usado para filtrar por bandeja (inboxId). */
export async function getThread(
  db: SupabaseClient,
  conn: HubspotConnectionSecrets,
  threadId: string
): Promise<HubspotThread> {
  return hubspotFetchJson<HubspotThread>(db, conn, `/conversations/v3/conversations/threads/${encodeURIComponent(threadId)}`);
}

/** Todos los mensajes del hilo — se usa para contar mensajes INCOMING y saber si este es el primero. */
export async function listThreadMessages(
  db: SupabaseClient,
  conn: HubspotConnectionSecrets,
  threadId: string
): Promise<HubspotThreadMessage[]> {
  const json = await hubspotFetchJson<{ results?: HubspotThreadMessage[] }>(
    db,
    conn,
    `/conversations/v3/conversations/threads/${encodeURIComponent(threadId)}/messages`
  );
  return json.results ?? [];
}

export interface SendThreadMessageInput {
  threadId: string;
  text: string;
  senderActorId: string;
  channelId: string;
  channelAccountId: string;
}

/** Publica una respuesta en el hilo — equivale a "responde al usuario" del flujo de n8n. */
export async function sendThreadMessage(
  db: SupabaseClient,
  conn: HubspotConnectionSecrets,
  input: SendThreadMessageInput
): Promise<void> {
  await hubspotFetchJson(db, conn, `/conversations/v3/conversations/threads/${encodeURIComponent(input.threadId)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      type: "MESSAGE",
      text: input.text,
      senderActorId: input.senderActorId,
      channelId: input.channelId,
      channelAccountId: input.channelAccountId
    })
  });
}

/** Bandejas del portal — alimenta el selector "¿de qué bandeja escuchar?" del nodo trigger. */
export async function listInboxes(db: SupabaseClient, conn: HubspotConnectionSecrets): Promise<HubspotInbox[]> {
  const json = await hubspotFetchJson<{ results?: HubspotInbox[] }>(db, conn, "/conversations/v3/conversations/inboxes");
  return json.results ?? [];
}
