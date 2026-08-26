import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkflowById } from "@/lib/automations/workflows-db";
import { findHubspotGreetingConfig, findMatchingHubspotTriggerNodeIds } from "@/lib/automations/node-types";
import { getActiveHubspotConnectionSecrets } from "@/lib/hubspot/connections-db";
import { getMessage, getThread, listThreadMessages, sendThreadMessage } from "@/lib/hubspot/conversations";
import { createContact, searchContactByPhone } from "@/lib/hubspot/contacts";
import { recordUsageSafe } from "@/lib/billing/meter";

const LOGGED_BODY_MAX_CHARS = 8000;

/** Un `conversation.newMessage` de HubSpot — ver pinData del flujo de n8n original. HubSpot manda un arreglo de estos por request. */
export interface HubspotConversationEvent {
  eventId: number;
  subscriptionType: string;
  portalId: number;
  objectId: number | string; // threadId
  messageId: string;
  messageType: string;
  changeFlag: string;
}

interface RunParams {
  organizationId: string;
  workflowId: string;
  triggerNodeId: string;
  event: HubspotConversationEvent;
}

async function logEvent(
  db: SupabaseClient,
  params: RunParams,
  patch: {
    status: "sent" | "no_response" | "error" | "captured";
    conversationId?: string;
    requestBody: unknown;
    errorMessage?: string;
  }
): Promise<void> {
  await db.from("automation_event_log").insert({
    organization_id: params.organizationId,
    workflow_id: params.workflowId,
    conversation_id: patch.conversationId ?? null,
    event_type: "hubspot.conversation_new_message",
    status: patch.status,
    error_message: patch.errorMessage?.slice(0, 500) ?? null,
    request_body: JSON.stringify(patch.requestBody).slice(0, LOGGED_BODY_MAX_CHARS)
  });
}

/**
 * Corre la cadena completa del saludo automático de HubSpot para un evento
 * `conversation.newMessage` — equivalente en Noova al flujo de n8n que se
 * migra (dedup → traer mensaje → filtrar entrante+bandeja → contacto →
 * ¿primer mensaje? → saludar). Motor paralelo al de WhatsApp
 * (`emitAutomationEvent` en events.ts): mismo estilo (recorrido explícito,
 * no genérico), pero HubSpot no pasa por ahí porque no es un canal de
 * WhatsApp de Noova. Nunca lanza — el llamador (la ruta pública del
 * webhook) debe invocarla con `void ... .catch(...)`, nunca `await` en el
 * camino crítico de la respuesta a HubSpot.
 */
export async function runHubspotMessageEvent(db: SupabaseClient, params: RunParams): Promise<void> {
  const threadId = String(params.event.objectId);

  // 1. Dedup — HubSpot reintenta webhooks que no respondieron a tiempo; sin esto, un reintento
  // volvería a saludar. Silencioso a propósito: es ruido esperado, no un evento de negocio.
  const { error: insertError } = await db
    .from("hubspot_processed_messages")
    .insert({ message_id: params.event.messageId, organization_id: params.organizationId, thread_id: threadId });
  if (insertError) {
    if (insertError.code === "23505") return; // ya procesado
    console.warn("[hubspot-runner] no se pudo registrar dedup:", insertError.message);
  }

  const conn = await getActiveHubspotConnectionSecrets(db, params.organizationId);
  if (!conn) {
    await logEvent(db, params, { status: "error", requestBody: params.event, errorMessage: "HubSpot no está conectado para esta organización" });
    return;
  }

  const workflow = await getWorkflowById(db, params.organizationId, params.workflowId);
  if (!workflow) return; // el workflow se borró entre que se registró el token y llegó el evento

  let message;
  try {
    message = await getMessage(db, conn, threadId, params.event.messageId);
  } catch (err) {
    await logEvent(db, params, {
      status: "error",
      conversationId: threadId,
      requestBody: params.event,
      errorMessage: err instanceof Error ? err.message : "Error trayendo el mensaje de HubSpot"
    });
    return;
  }

  // Solo mensajes del contacto final — un OUTGOING es una respuesta manual del equipo, no dispara saludo.
  if (message.direction !== "INCOMING") return;

  let thread;
  try {
    thread = await getThread(db, conn, threadId);
  } catch (err) {
    await logEvent(db, params, {
      status: "error",
      conversationId: threadId,
      requestBody: { event: params.event, message },
      errorMessage: err instanceof Error ? err.message : "Error trayendo el hilo de HubSpot"
    });
    return;
  }

  // Filtro de bandeja: node.data.hubspotInboxIds vacío = cualquier bandeja. Si el nodo trigger
  // que resolvió el token no aplica a esta bandeja, se corta en silencio (filtrado rutinario, no un error).
  const matchingTriggerIds = findMatchingHubspotTriggerNodeIds(workflow.graph, thread.inboxId);
  if (!matchingTriggerIds.includes(params.triggerNodeId)) return;

  const contact = { label: message.senders[0]?.name ?? null, phone: message.senders[0]?.deliveryIdentifier?.value ?? "" };
  const baseRequestBody = { event: params.event, contact, conversation_id: threadId, message: { text: message.text } };

  const config = findHubspotGreetingConfig(workflow.graph, params.triggerNodeId);
  if (!config) {
    // Igual se deja el JSON real recibido — así "Escuchar evento de prueba" funciona aunque el
    // nodo trigger todavía no esté conectado a ningún "Saludo automático HubSpot".
    await logEvent(db, params, { status: "captured", conversationId: threadId, requestBody: baseRequestBody });
    return;
  }

  if (!contact.phone) {
    await logEvent(db, params, {
      status: "no_response",
      conversationId: threadId,
      requestBody: baseRequestBody,
      errorMessage: "El mensaje no trae un teléfono de remitente identificable"
    });
    return;
  }

  let existingContact;
  try {
    existingContact = await searchContactByPhone(db, conn, contact.phone);
    if (!existingContact) {
      if (!config.createContactIfMissing) {
        await logEvent(db, params, {
          status: "no_response",
          conversationId: threadId,
          requestBody: baseRequestBody,
          errorMessage: "No existe contacto con ese teléfono y la creación automática está desactivada"
        });
        return;
      }
      await createContact(db, conn, {
        phone: contact.phone,
        fullName: contact.label,
        placeholderEmailDomain: config.placeholderEmailDomain
      });
    }
  } catch (err) {
    await logEvent(db, params, {
      status: "error",
      conversationId: threadId,
      requestBody: baseRequestBody,
      errorMessage: err instanceof Error ? err.message : "Error validando/creando el contacto en HubSpot"
    });
    return;
  }

  if (config.onlyFirstMessage) {
    let messages;
    try {
      messages = await listThreadMessages(db, conn, threadId);
    } catch (err) {
      await logEvent(db, params, {
        status: "error",
        conversationId: threadId,
        requestBody: baseRequestBody,
        errorMessage: err instanceof Error ? err.message : "Error contando los mensajes del hilo"
      });
      return;
    }
    const incomingCount = messages.filter((m) => m.direction === "INCOMING" && m.type === "MESSAGE").length;
    if (incomingCount !== 1) {
      await logEvent(db, params, {
        status: "no_response",
        conversationId: threadId,
        requestBody: baseRequestBody,
        errorMessage: `Ya hay conversación previa con este contacto (${incomingCount} mensajes entrantes) — se omite el saludo`
      });
      return;
    }
  }

  try {
    await sendThreadMessage(db, conn, {
      threadId,
      text: config.greetingText,
      senderActorId: config.senderActorId,
      channelId: message.channelId ?? "",
      channelAccountId: message.channelAccountId ?? ""
    });
  } catch (err) {
    await logEvent(db, params, {
      status: "error",
      conversationId: threadId,
      requestBody: baseRequestBody,
      errorMessage: err instanceof Error ? err.message : "Error enviando el saludo en HubSpot"
    });
    return;
  }

  await logEvent(db, params, { status: "sent", conversationId: threadId, requestBody: baseRequestBody });

  // La API de HubSpot no cobra por llamada — se registra el consumo en créditos de Noova con costo
  // de proveedor en 0, mismo patrón que "automation_extract" en events.ts pero sin componente LLM.
  await recordUsageSafe({
    db,
    organizationId: params.organizationId,
    eventType: "hubspot_greeting",
    channel: "automations",
    provider: "hubspot",
    providerCostUsdOverride: 0,
    referenceType: "hubspot_thread",
    referenceId: threadId,
    idempotencyKey: `hubspot_greeting_${params.workflowId}_${params.event.messageId}`
  });
}
