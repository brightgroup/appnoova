/**
 * Importa historial de Chatwoot → Noova (text_agent_conversations / Inbox).
 *
 * Requisitos en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CHATWOOT_BASE_URL=https://app.chatwoot.com
 *   CHATWOOT_ACCOUNT_ID=1
 *   CHATWOOT_API_TOKEN=...
 *
 * Uso:
 *   node scripts/import-chatwoot.mjs --dry-run \
 *     --user-id UUID --text-agent-id UUID --whatsapp-channel-id UUID
 *
 *   node scripts/import-chatwoot.mjs \
 *     --user-id UUID --text-agent-id UUID --whatsapp-channel-id UUID \
 *     --inbox-id 12
 *
 * Opciones:
 *   --dry-run              Solo muestra resumen, no escribe en Supabase
 *   --inbox-id N           Filtra inbox WhatsApp en Chatwoot
 *   --limit N              Máximo conversaciones a procesar
 *   --conversation-id N    Importa una sola conversación (prueba)
 *   --skip-existing        No reimportar si metadata.chatwoot_conversation_ids ya incluye el id
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/load-env.mjs";
import {
  ChatwootClient,
  extractContactFromConversation,
  mapChatwootMessage
} from "./lib/chatwoot-api.mjs";

const env = loadEnv();

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const dryRun = hasFlag("dry-run");
const skipExisting = hasFlag("skip-existing");
const userId = arg("user-id") ?? env.IMPORT_USER_ID;
const textAgentId = arg("text-agent-id") ?? env.IMPORT_TEXT_AGENT_ID;
const whatsappChannelId = arg("whatsapp-channel-id") ?? env.IMPORT_WHATSAPP_CHANNEL_ID;
const inboxId = arg("inbox-id") ?? env.CHATWOOT_INBOX_ID;
const limit = arg("limit") ? Number(arg("limit")) : undefined;
const singleConversationId = arg("conversation-id");

const chatwootUrl = env.CHATWOOT_BASE_URL;
const chatwootAccountId = env.CHATWOOT_ACCOUNT_ID;
const chatwootToken = env.CHATWOOT_API_TOKEN;

function fail(msg) {
  console.error(`\nError: ${msg}\n`);
  process.exit(1);
}

if (!userId || !textAgentId || !whatsappChannelId) {
  fail("Faltan --user-id, --text-agent-id y --whatsapp-channel-id (o IMPORT_* en .env.local)");
}
if (!chatwootUrl || !chatwootAccountId || !chatwootToken) {
  fail("Faltan CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID y CHATWOOT_API_TOKEN en .env.local");
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  fail("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local");
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const chatwoot = new ChatwootClient({
  baseUrl: chatwootUrl,
  accountId: chatwootAccountId,
  token: chatwootToken
});

function estimateCredits(n) {
  return Math.max(1, Math.round(n * 0.5));
}

function buildSummary(messages) {
  if (!messages.length) return "Historial importado de Chatwoot.";
  const joined = messages
    .slice(-6)
    .map(m => {
      const who = m.role === "user" ? "Cliente" : m.role === "human" ? "Asesor" : "Bot";
      return `${who}: ${m.content}`;
    })
    .join(" ");
  return joined.length <= 320 ? joined : `${joined.slice(0, 317)}...`;
}

function stripInternal(msg) {
  const { _chatwoot_message_id, ...rest } = msg;
  return rest;
}

function messageKey(msg) {
  return `${msg.created_at}|${msg.role}|${msg.content.slice(0, 80)}`;
}

function mergeMessages(existing, incoming) {
  const seen = new Set(existing.map(messageKey));
  const merged = [...existing];
  for (const msg of incoming) {
    const clean = stripInternal(msg);
    const key = messageKey(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(clean);
  }
  merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return merged;
}

function lastInboundAt(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i].created_at;
  }
  return undefined;
}

async function findExistingConversation(contactE164) {
  const { data, error } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", "whatsapp")
    .contains("metadata", {
      whatsapp_channel_id: whatsappChannelId,
      whatsapp_contact_e164: contactE164
    })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function fetchChatwootConversations() {
  if (singleConversationId) {
    const messages = await chatwoot.listMessages(singleConversationId);
    return [{ id: Number(singleConversationId), messages, _single: true }];
  }

  const out = [];
  for await (const conv of chatwoot.iterateConversations({ inboxId, status: "all" })) {
    out.push(conv);
    if (limit && out.length >= limit) break;
  }
  return out;
}

async function loadMessagesForConversation(conv) {
  if (conv._single && conv.messages) return conv.messages;
  return chatwoot.listMessages(conv.id);
}

async function processConversation(conv, stats) {
  const contact = extractContactFromConversation(conv);
  if (!contact.phone) {
    stats.skippedNoPhone += 1;
    console.log(`  · conv ${conv.id}: sin teléfono, omitida`);
    return;
  }

  const rawMessages = await loadMessagesForConversation(conv);
  const mapped = rawMessages
    .map(mapChatwootMessage)
    .filter(Boolean);

  if (!mapped.length) {
    stats.skippedEmpty += 1;
    console.log(`  · conv ${conv.id} (${contact.phone}): sin mensajes importables`);
    return;
  }

  const contactLabel = contact.name || contact.phone;
  const existing = await findExistingConversation(contact.phone);

  if (existing) {
    const meta = existing.metadata ?? {};
    const importedIds = Array.isArray(meta.chatwoot_conversation_ids)
      ? meta.chatwoot_conversation_ids.map(String)
      : meta.chatwoot_conversation_id
        ? [String(meta.chatwoot_conversation_id)]
        : [];

    if (skipExisting && importedIds.includes(String(conv.id))) {
      stats.skippedDuplicate += 1;
      console.log(`  · conv ${conv.id} (${contact.phone}): ya importada`);
      return;
    }

    const existingMessages = Array.isArray(existing.messages) ? existing.messages : [];
    const messages = mergeMessages(existingMessages, mapped);
    const chatwootMessageIds = [
      ...(Array.isArray(meta.chatwoot_message_ids) ? meta.chatwoot_message_ids : []),
      ...mapped.map(m => m._chatwoot_message_id).filter(Boolean)
    ];

    const patch = {
      contact_label: contactLabel,
      messages,
      messages_count: messages.length,
      user_messages_count: messages.filter(m => m.role === "user").length,
      credits: estimateCredits(messages.length),
      summary: buildSummary(messages),
      updated_at: messages[messages.length - 1]?.created_at ?? existing.updated_at,
      metadata: {
        ...meta,
        whatsapp_channel_id: whatsappChannelId,
        whatsapp_contact_e164: contact.phone,
        whatsapp_last_inbound_at: lastInboundAt(messages) ?? meta.whatsapp_last_inbound_at,
        imported_from: "chatwoot",
        chatwoot_conversation_ids: [...new Set([...importedIds, String(conv.id)])],
        chatwoot_message_ids: [...new Set(chatwootMessageIds.map(String))],
        chatwoot_imported_at: new Date().toISOString()
      }
    };

    if (dryRun) {
      stats.merged += 1;
      console.log(
        `  · [dry-run] merge conv ${conv.id} → existente ${existing.id} (${contact.phone}): +${mapped.length} msgs → ${messages.length} total`
      );
      return;
    }

    const { error } = await db
      .from("text_agent_conversations")
      .update(patch)
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
    stats.merged += 1;
    console.log(`  · merge conv ${conv.id} → ${existing.id} (${contact.phone}): ${messages.length} msgs`);
    return;
  }

  const messages = mergeMessages([], mapped);
  const createdAt = messages[0]?.created_at ?? new Date().toISOString();
  const updatedAt = messages[messages.length - 1]?.created_at ?? createdAt;

  const row = {
    user_id: userId,
    text_agent_id: textAgentId,
    channel: "whatsapp",
    contact_label: contactLabel,
    messages_count: messages.length,
    user_messages_count: messages.filter(m => m.role === "user").length,
    duration_sec: Math.max(
      0,
      Math.round((new Date(updatedAt).getTime() - new Date(createdAt).getTime()) / 1000)
    ),
    credits: estimateCredits(messages.length),
    status: "ended",
    status_label: "Importado Chatwoot",
    user_sentiment: "Neutral",
    summary: buildSummary(messages),
    messages,
    llm_model: "gemini-2.5-flash",
    handoff_mode: "ai",
    unread_count: 0,
    created_at: createdAt,
    updated_at: updatedAt,
    ended_at: updatedAt,
    metadata: {
      whatsapp_channel_id: whatsappChannelId,
      whatsapp_contact_e164: contact.phone,
      whatsapp_last_inbound_at: lastInboundAt(messages),
      imported_from: "chatwoot",
      chatwoot_conversation_ids: [String(conv.id)],
      chatwoot_message_ids: mapped.map(m => String(m._chatwoot_message_id)).filter(Boolean),
      chatwoot_imported_at: new Date().toISOString()
    }
  };

  if (dryRun) {
    stats.created += 1;
    console.log(
      `  · [dry-run] nueva conv ${conv.id} (${contact.phone}): ${messages.length} msgs`
    );
    return;
  }

  const { data, error } = await db
    .from("text_agent_conversations")
    .insert(row)
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  stats.created += 1;
  console.log(`  · nueva conv ${conv.id} → ${data.id} (${contact.phone}): ${messages.length} msgs`);
}

async function main() {
  console.log("Import Chatwoot → Noova");
  console.log(`  Modo: ${dryRun ? "DRY-RUN (sin escribir)" : "ESCRITURA"}`);
  console.log(`  Chatwoot: ${chatwootUrl} / account ${chatwootAccountId}`);
  console.log(`  Noova user: ${userId}`);
  console.log(`  Agente texto: ${textAgentId}`);
  console.log(`  Canal WA: ${whatsappChannelId}`);
  if (inboxId) console.log(`  Inbox Chatwoot: ${inboxId}`);

  const { data: channel, error: chErr } = await db
    .from("whatsapp_channels")
    .select("id, e164, user_id")
    .eq("id", whatsappChannelId)
    .maybeSingle();

  if (chErr || !channel) fail(`Canal WhatsApp ${whatsappChannelId} no encontrado`);
  if (String(channel.user_id) !== String(userId)) {
    fail(`El canal ${whatsappChannelId} no pertenece al user ${userId}`);
  }
  console.log(`  Línea Twilio: ${channel.e164}\n`);

  const conversations = await fetchChatwootConversations();
  console.log(`Conversaciones a procesar: ${conversations.length}\n`);

  const stats = {
    created: 0,
    merged: 0,
    skippedNoPhone: 0,
    skippedEmpty: 0,
    skippedDuplicate: 0,
    errors: 0
  };

  for (const conv of conversations) {
    try {
      await processConversation(conv, stats);
    } catch (e) {
      stats.errors += 1;
      console.error(`  · conv ${conv.id} ERROR:`, e.message);
    }
  }

  console.log("\n--- Resumen ---");
  console.log(`  Creadas:     ${stats.created}`);
  console.log(`  Fusionadas:  ${stats.merged}`);
  console.log(`  Sin teléfono:${stats.skippedNoPhone}`);
  console.log(`  Sin mensajes:${stats.skippedEmpty}`);
  console.log(`  Duplicadas:  ${stats.skippedDuplicate}`);
  console.log(`  Errores:     ${stats.errors}`);

  if (dryRun) {
    console.log("\nEjecuta sin --dry-run para importar de verdad.");
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
