import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getWebhookTriggerByToken, type WebhookTriggerLookup } from "@/lib/automations/webhook-triggers-db";
import { getWorkflowById } from "@/lib/automations/workflows-db";
import { findSendMessageTargets, resolveJsonPath, resolveJsonPathArray, type SendMessageTarget } from "@/lib/automations/node-types";
import { conversationBelongsToOrg } from "@/lib/inbox-org-scope";
import {
  sendWhatsAppOutboundForConversation,
  sendWhatsAppMediaOutboundForConversation,
  sendWhatsAppMediaBinaryOutboundForConversation
} from "@/lib/whatsapp/process-inbound";
import { sendWhatsAppTemplateForConversation } from "@/lib/whatsapp/send-template";
import { persistHumanReply } from "@/lib/text-conversation-persist";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { params: Promise<{ token: string }> };

const LOGGED_BODY_MAX_CHARS = 8000;

type SendResult = { ok: boolean; error?: string; code?: string };

interface DeliverParams {
  organizationId: string;
  conversationId: string;
  workflowId?: string;
  /** JSON crudo recibido en este callback, tal como lo mandó el sistema externo — para inspección en la UI. */
  requestBody: string;
  send: (db: SupabaseClient, ownerUserId: string, conversationId: string) => Promise<SendResult>;
}

async function deliverReply(db: SupabaseClient, params: DeliverParams) {
  const belongsToOrg = await conversationBelongsToOrg(db, params.conversationId, params.organizationId);
  if (!belongsToOrg) {
    return NextResponse.json({ error: "Conversación no encontrada para esta organización" }, { status: 404 });
  }

  const { data: conversation } = await db
    .from("text_agent_conversations")
    .select("user_id")
    .eq("id", params.conversationId)
    .maybeSingle();

  const ownerUserId = conversation?.user_id ? String(conversation.user_id) : null;
  if (!ownerUserId) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const sendResult = await params.send(db, ownerUserId, params.conversationId);

  await db.from("automation_event_log").insert({
    organization_id: params.organizationId,
    workflow_id: params.workflowId ?? null,
    conversation_id: params.conversationId,
    event_type: "automation.callback",
    status: sendResult.ok ? "responded" : "error",
    error_message: sendResult.ok ? null : (sendResult.error ?? "Error desconocido").slice(0, 500),
    request_body: params.requestBody.slice(0, LOGGED_BODY_MAX_CHARS)
  });

  if (!sendResult.ok) {
    const httpStatus = sendResult.code === "session_closed" || sendResult.code === "opted_out" ? 409 : 502;
    return NextResponse.json({ error: sendResult.error ?? "No se pudo enviar" }, { status: httpStatus });
  }
  return NextResponse.json({ ok: true });
}

/** Arma el `send` según el tipo de mensaje configurado en el nodo, extrayendo del JSON recibido lo que cada tipo necesita. Null = validación falló. */
function buildSendForTarget(
  body: unknown,
  target: SendMessageTarget
): { send: DeliverParams["send"] } | { error: string } {
  if (target.messageType === "template") {
    if (!target.templateId) {
      return { error: "El nodo 'Enviar mensaje de WhatsApp' no tiene una plantilla elegida" };
    }
    const variableValues = resolveJsonPathArray(body, target.variablesPath) ?? [];
    return {
      send: (db, ownerUserId, conversationId) =>
        sendWhatsAppTemplateForConversation({
          db,
          userId: ownerUserId,
          conversationId,
          templateId: target.templateId,
          variableValues,
          assignedTo: ownerUserId
        })
    };
  }

  // Modo "libre" (antes texto e imagen/documento eran mutuamente excluyentes, un nodo por
  // tipo): se resuelve lo que realmente venga en ESTE JSON, no lo que se eligió al armar el
  // nodo — mandas texto, adjunto, o ambos en la misma llamada, como en Zapier. Si trae
  // adjunto, el texto viaja como caption en el mismo mensaje de WhatsApp; si no trae adjunto
  // pero sí texto, se manda como texto normal. `captionPath` se revisa como respaldo para no
  // romper nodos guardados antes de este cambio (usaban un campo de caption aparte).
  const mediaUrl = resolveJsonPath(body, target.mediaUrlPath)?.trim();
  const text =
    resolveJsonPath(body, target.messageTextPath)?.trim() || resolveJsonPath(body, target.captionPath)?.trim();

  if (mediaUrl) {
    return {
      send: (db, ownerUserId, conversationId) =>
        sendWhatsAppMediaOutboundForConversation(db, ownerUserId, conversationId, mediaUrl, target.mediaType, text)
    };
  }

  if (text) {
    return {
      // sendWhatsAppOutboundForConversation es compartida con la respuesta manual del Inbox
      // (esa ya persiste antes de enviar) — acá se persiste después de enviar, para no duplicar
      // el mensaje en ese otro flujo. Antes este envío salía por WhatsApp pero no quedaba
      // registrado en el historial del chat de Noova.
      send: async (db, ownerUserId, conversationId) => {
        const sendResult = await sendWhatsAppOutboundForConversation(db, ownerUserId, conversationId, text);
        if (!sendResult.ok) return sendResult;
        const persist = await persistHumanReply({
          db,
          userId: ownerUserId,
          conversationId,
          content: text,
          assignedTo: ownerUserId
        });
        if (!persist.ok) {
          return { ok: false, error: persist.error ?? "Mensaje enviado pero no se guardó en Inbox" };
        }
        return { ok: true };
      }
    };
  }

  return { error: `Falta '${target.messageTextPath}' o '${target.mediaUrlPath}' en el JSON recibido` };
}

/**
 * Callback público (sin sesión) para el "webhook inverso": un sistema externo
 * (n8n u otro) llama esta URL para reenviar una respuesta al cliente final
 * por el mismo chat de WhatsApp. El token de la URL siempre resuelve a un
 * nodo `trigger.webhook` dentro de un workflow (URL propia generada al
 * agregar el nodo) — el mapeo de campos y el tipo de mensaje (texto,
 * plantilla o media) los define cada nodo `action.send_whatsapp_message`
 * conectado a ese disparador. Los conectores (`automation_connection`) solo
 * manejan el lado de salida — no tienen callback propio.
 */
/**
 * Rama del webhook para cuando el sistema de origen (ej. n8n) manda el binario crudo del
 * archivo (imagen/PDF) como cuerpo del POST — sin JSON, sin base64 — porque codificar el
 * archivo en base64 antes de mandarlo le pesó a su servidor (~33% más de tamaño/CPU para armar
 * el JSON). Se activa solo cuando `Content-Type` no es `application/json`. Como el cuerpo
 * entero es el archivo, `conversation_id` (y opcionalmente `caption`) van en la URL como query
 * params: `.../inbound/TOKEN?conversation_id=...&caption=...`.
 */
async function handleBinaryWebhookPost(
  req: NextRequest,
  db: SupabaseClient,
  trigger: WebhookTriggerLookup,
  targets: SendMessageTarget[],
  contentType: string
): Promise<NextResponse> {
  const conversationId = req.nextUrl.searchParams.get("conversation_id")?.trim();
  const caption = req.nextUrl.searchParams.get("caption")?.trim() || undefined;
  const buffer = Buffer.from(await req.arrayBuffer());
  const requestBodyLog = `[binario ${buffer.length} bytes, content-type: ${contentType}]`;

  if (!conversationId) {
    return NextResponse.json(
      { error: "Falta 'conversation_id' en la URL — usa .../inbound/TOKEN?conversation_id=..." },
      { status: 400 }
    );
  }
  if (buffer.length === 0) {
    return NextResponse.json({ error: "Cuerpo vacío" }, { status: 400 });
  }

  // El binario crudo no tiene forma de pedir una plantilla (HSM) ni un mensaje de solo texto —
  // solo sirve para el modo "adjunto", así que se ignoran los nodos de plantilla conectados.
  const sendTargets = targets.filter(t => t.messageType !== "template");
  if (sendTargets.length === 0) {
    await db.from("automation_event_log").insert({
      organization_id: trigger.organizationId,
      workflow_id: trigger.workflowId,
      conversation_id: conversationId,
      event_type: "webhook.received",
      status: "captured",
      request_body: requestBodyLog
    });
    return NextResponse.json(
      { error: "Este webhook no está conectado a ningún nodo de 'Enviar mensaje de WhatsApp'" },
      { status: 422 }
    );
  }

  let lastResponse: NextResponse | null = null;
  for (const target of sendTargets) {
    lastResponse = await deliverReply(db, {
      organizationId: trigger.organizationId,
      conversationId,
      workflowId: trigger.workflowId,
      requestBody: requestBodyLog,
      send: (dbInner, ownerUserId, convId) =>
        sendWhatsAppMediaBinaryOutboundForConversation(dbInner, ownerUserId, convId, buffer, contentType, target.mediaType, caption)
    });
  }
  return lastResponse ?? NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const db = textAgentsAdminClient();

  const trigger = await getWebhookTriggerByToken(db, token);
  if (!trigger) {
    return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  }

  const workflow = await getWorkflowById(db, trigger.organizationId, trigger.workflowId);
  if (!workflow) {
    return NextResponse.json({ error: "Workflow no encontrado" }, { status: 404 });
  }
  const targets = findSendMessageTargets(workflow.graph, trigger.nodeId);

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType && contentType !== "application/json") {
    return handleBinaryWebhookPost(req, db, trigger, targets, contentType);
  }

  const rawBody = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (targets.length === 0) {
    // Igual se deja el JSON real recibido — así "Escuchar evento de prueba" en el editor
    // funciona aunque el nodo Webhook entrante todavía no esté conectado a nada.
    await db.from("automation_event_log").insert({
      organization_id: trigger.organizationId,
      workflow_id: trigger.workflowId,
      event_type: "webhook.received",
      status: "captured",
      request_body: rawBody.slice(0, LOGGED_BODY_MAX_CHARS)
    });
    return NextResponse.json(
      { error: "Este webhook no está conectado a ningún nodo de 'Enviar mensaje de WhatsApp'" },
      { status: 422 }
    );
  }

  let lastResponse: NextResponse | null = null;
  for (const target of targets) {
    const conversationId = resolveJsonPath(body, target.conversationIdPath)?.trim();
    if (!conversationId) {
      lastResponse = NextResponse.json(
        { error: `Falta '${target.conversationIdPath}' en el JSON recibido` },
        { status: 400 }
      );
      continue;
    }

    const resolved = buildSendForTarget(body, target);
    if ("error" in resolved) {
      lastResponse = NextResponse.json({ error: resolved.error }, { status: 400 });
      continue;
    }

    lastResponse = await deliverReply(db, {
      organizationId: trigger.organizationId,
      conversationId,
      workflowId: trigger.workflowId,
      requestBody: rawBody,
      send: resolved.send
    });
  }
  return lastResponse ?? NextResponse.json({ ok: true });
}
