import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkflowById } from "@/lib/automations/workflows-db";
import { walkHubspotChain, findMatchingHubspotTriggerNodeIds, resolveJsonPath } from "@/lib/automations/node-types";
import { getActiveHubspotConnectionSecrets } from "@/lib/hubspot/connections-db";
import { getMessage, getThread, listThreadMessages, sendThreadMessage, type HubspotThreadMessage } from "@/lib/hubspot/conversations";
import { createContact, getContactOwnerId, searchContactByPhone, updateContactOwner } from "@/lib/hubspot/contacts";
import { resolveOwnerIdFromAssignedActor } from "@/lib/hubspot/owners";
import { runFieldExtraction } from "@/lib/automations/extract";
import { recordUsageSafe } from "@/lib/billing/meter";
import { providerForLlmModel } from "@/lib/billing/pricing";

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
  // supabase-js no lanza excepción ante un error de inserción (constraint, tipo de columna, etc.) —
  // devuelve `{ error }` en la respuesta. Si no se revisa, un fallo acá queda invisible: el runner
  // sigue corriendo normal, pero nunca deja rastro en Ejecuciones. Pasó exactamente eso con
  // conversation_id (ver migración 109) — de ahí este console.error explícito.
  const { error } = await db.from("automation_event_log").insert({
    organization_id: params.organizationId,
    workflow_id: params.workflowId,
    conversation_id: patch.conversationId ?? null,
    event_type: "hubspot.conversation_new_message",
    status: patch.status,
    error_message: patch.errorMessage?.slice(0, 500) ?? null,
    request_body: JSON.stringify(patch.requestBody).slice(0, LOGGED_BODY_MAX_CHARS)
  });
  if (error) {
    console.error("[hubspot-runner] no se pudo escribir en automation_event_log:", error.message);
  }
}

/**
 * Corre la cadena de nodos de HubSpot conectados a un `trigger.hubspot_message`
 * para un evento `conversation.newMessage` real — equivalente en Noova al
 * flujo de n8n que se migra, pero como pasos independientes y reutilizables
 * (`action.ai_extract` → `action.hubspot_upsert_contact` →
 * `action.hubspot_send_message`, en cualquier orden y cantidad — ver
 * `walkHubspotChain`) en vez de un único nodo todo-en-uno. Motor paralelo al
 * de WhatsApp (`emitAutomationEvent` en events.ts): mismo estilo (recorrido
 * explícito, no genérico), pero HubSpot no pasa por ahí porque no es un
 * canal de WhatsApp de Noova. Nunca lanza — el llamador (la ruta pública del
 * webhook) debe invocarla con `void ... .catch(...)`, nunca `await` en el
 * camino crítico de la respuesta a HubSpot.
 */
export async function runHubspotMessageEvent(db: SupabaseClient, params: RunParams): Promise<void> {
  const threadId = String(params.event.objectId);

  // 1. Dedup — HubSpot reintenta webhooks que no respondieron a tiempo; sin esto, un reintento
  // volvería a reprocesar todo. Silencioso a propósito: es ruido esperado, no un evento de negocio.
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

  let message: HubspotThreadMessage;
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

  // Solo mensajes del contacto final — un OUTGOING es una respuesta manual del equipo, no dispara nada.
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

  const steps = walkHubspotChain(workflow.graph, params.triggerNodeId);
  if (steps.length === 0) {
    // Igual se deja el JSON real recibido — así "Escuchar evento de prueba" funciona aunque el
    // trigger todavía no esté conectado a ningún nodo de acción.
    await logEvent(db, params, { status: "captured", conversationId: threadId, requestBody: baseRequestBody });
    return;
  }

  // Contexto interno que cada paso puede leer/enriquecer — `extracted` lo llena un
  // `action.ai_extract` conectado en la cadena; `action.hubspot_send_message` con
  // origen "upstream" lee de acá por dot-path (ver resolveJsonPath).
  const context: Record<string, unknown> = { event: params.event, message: { text: message.text }, contact, extracted: null };

  // Se calcula perezosamente (memoizado) porque solo hace falta si algún paso pide "solo primer
  // mensaje" — y no cambia entre pasos dentro de esta misma ejecución (nuestro propio envío,
  // si lo hay, es OUTGOING, no afecta el conteo de mensajes INCOMING del hilo).
  // Id del contacto resuelto por un action.hubspot_upsert_contact anterior en la cadena —
  // action.hubspot_assign_owner lo necesita para saber a qué contacto asignarle el propietario.
  let contactId: string | null = null;
  let incomingCountCache: number | null = null;
  async function isFirstIncomingMessage(): Promise<{ isFirst: boolean; count: number }> {
    if (incomingCountCache === null) {
      const messages = await listThreadMessages(db, conn!, threadId);
      incomingCountCache = messages.filter((m) => m.direction === "INCOMING" && m.type === "MESSAGE").length;
    }
    return { isFirst: incomingCountCache === 1, count: incomingCountCache };
  }

  for (const step of steps) {
    if (step.kind === "ai_extract") {
      const extraction = await runFieldExtraction(step.fields, message.text ?? "", "text", step.model, undefined, step.generalInstruction);
      context.extracted = extraction.extracted;
      if (extraction.error) {
        console.warn("[hubspot-runner] extracción con IA falló:", JSON.stringify({ workflowId: params.workflowId, error: extraction.error }));
      }
      if (extraction.model) {
        await recordUsageSafe({
          db,
          organizationId: params.organizationId,
          eventType: "automation_extract",
          channel: "automations",
          provider: providerForLlmModel(extraction.model),
          model: extraction.model,
          gemini: extraction.usage,
          referenceType: "hubspot_thread",
          referenceId: threadId,
          idempotencyKey: `automation_extract_${params.workflowId}_${params.event.messageId}`
        });
      }
      continue;
    }

    if (step.kind === "upsert_contact") {
      if (!contact.phone) {
        await logEvent(db, params, {
          status: "no_response",
          conversationId: threadId,
          requestBody: baseRequestBody,
          errorMessage: "El mensaje no trae un teléfono de remitente identificable"
        });
        return;
      }
      try {
        const existingContact = await searchContactByPhone(db, conn, contact.phone);
        if (existingContact) {
          contactId = existingContact.id;
        } else {
          if (!step.createIfMissing) {
            await logEvent(db, params, {
              status: "no_response",
              conversationId: threadId,
              requestBody: baseRequestBody,
              errorMessage: "No existe contacto con ese teléfono y la creación automática está desactivada"
            });
            return;
          }
          const created = await createContact(db, conn, { phone: contact.phone, fullName: contact.label, placeholderEmailDomain: step.placeholderEmailDomain });
          contactId = created.id;
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
      continue;
    }

    if (step.kind === "assign_owner") {
      if (!contactId) {
        await logEvent(db, params, {
          status: "error",
          conversationId: threadId,
          requestBody: baseRequestBody,
          errorMessage: "'Asignar propietario' necesita ir conectado después de 'Crear o actualizar contacto'"
        });
        return;
      }
      // Sin agente asignado a la conversación: no es un error, simplemente no hay nada que copiar.
      if (!thread.assignedTo) continue;

      try {
        const ownerId = await resolveOwnerIdFromAssignedActor(db, conn, thread.assignedTo);
        if (!ownerId) continue; // el actor asignado no corresponde a un owner de CRM (ej. un bot)

        if (step.onlyIfEmpty) {
          const currentOwnerId = await getContactOwnerId(db, conn, contactId);
          if (currentOwnerId) continue;
        }

        await updateContactOwner(db, conn, contactId, ownerId);
      } catch (err) {
        await logEvent(db, params, {
          status: "error",
          conversationId: threadId,
          requestBody: baseRequestBody,
          errorMessage: err instanceof Error ? err.message : "Error asignando el propietario del contacto"
        });
        return;
      }
      continue;
    }

    // step.kind === "send_message"
    if (step.onlyFirstMessage) {
      let firstCheck: { isFirst: boolean; count: number };
      try {
        firstCheck = await isFirstIncomingMessage();
      } catch (err) {
        await logEvent(db, params, {
          status: "error",
          conversationId: threadId,
          requestBody: baseRequestBody,
          errorMessage: err instanceof Error ? err.message : "Error contando los mensajes del hilo"
        });
        return;
      }
      if (!firstCheck.isFirst) {
        await logEvent(db, params, {
          status: "no_response",
          conversationId: threadId,
          requestBody: baseRequestBody,
          errorMessage: `Ya hay conversación previa con este contacto (${firstCheck.count} mensajes entrantes) — se omite el envío`
        });
        return;
      }
    }

    const text = (step.source === "upstream" ? resolveJsonPath(context, step.textPath) : step.text)?.trim();
    if (!text) {
      await logEvent(db, params, {
        status: "error",
        conversationId: threadId,
        requestBody: baseRequestBody,
        errorMessage:
          step.source === "upstream"
            ? `No se encontró texto en '${step.textPath}' del contexto interno`
            : "El nodo 'Enviar mensaje' no tiene texto configurado"
      });
      return;
    }

    try {
      await sendThreadMessage(db, conn, {
        threadId,
        text,
        senderActorId: step.senderActorId,
        channelId: message.channelId ?? "",
        channelAccountId: message.channelAccountId ?? ""
      });
    } catch (err) {
      await logEvent(db, params, {
        status: "error",
        conversationId: threadId,
        requestBody: baseRequestBody,
        errorMessage: err instanceof Error ? err.message : "Error enviando el mensaje en HubSpot"
      });
      return;
    }

    await logEvent(db, params, { status: "sent", conversationId: threadId, requestBody: baseRequestBody });

    // La API de HubSpot no cobra por llamada — se registra el consumo en créditos de Noova con costo
    // de proveedor en 0, mismo patrón que "automation_extract" en events.ts pero sin componente LLM.
    await recordUsageSafe({
      db,
      organizationId: params.organizationId,
      eventType: "hubspot_send_message",
      channel: "automations",
      provider: "hubspot",
      providerCostUsdOverride: 0,
      referenceType: "hubspot_thread",
      referenceId: threadId,
      idempotencyKey: `hubspot_send_message_${params.workflowId}_${params.event.messageId}`
    });
  }
}
