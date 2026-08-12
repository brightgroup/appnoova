import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getWebhookTriggerByToken } from "@/lib/automations/webhook-triggers-db";
import { getWorkflowById } from "@/lib/automations/workflows-db";
import { findSendMessageTargets, resolveJsonPath, resolveJsonPathArray, type SendMessageTarget } from "@/lib/automations/node-types";
import { conversationBelongsToOrg } from "@/lib/inbox-org-scope";
import {
  sendWhatsAppOutboundForConversation,
  sendWhatsAppMediaOutboundForConversation
} from "@/lib/whatsapp/process-inbound";
import { sendWhatsAppTemplateForConversation } from "@/lib/whatsapp/send-template";
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

  if (target.messageType === "media") {
    const mediaUrl = resolveJsonPath(body, target.mediaUrlPath)?.trim();
    if (!mediaUrl) {
      return { error: `Falta '${target.mediaUrlPath}' en el JSON recibido` };
    }
    const caption = resolveJsonPath(body, target.captionPath)?.trim();
    return {
      send: (db, ownerUserId, conversationId) =>
        sendWhatsAppMediaOutboundForConversation(db, ownerUserId, conversationId, mediaUrl, target.mediaType, caption)
    };
  }

  const replyText = resolveJsonPath(body, target.messageTextPath)?.trim();
  if (!replyText) {
    return { error: `Falta '${target.messageTextPath}' en el JSON recibido` };
  }
  return {
    send: (db, ownerUserId, conversationId) => sendWhatsAppOutboundForConversation(db, ownerUserId, conversationId, replyText)
  };
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
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const db = textAgentsAdminClient();

  const rawBody = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const trigger = await getWebhookTriggerByToken(db, token);
  if (trigger) {
    const workflow = await getWorkflowById(db, trigger.organizationId, trigger.workflowId);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow no encontrado" }, { status: 404 });
    }
    const targets = findSendMessageTargets(workflow.graph, trigger.nodeId);
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

  return NextResponse.json({ error: "Token inválido" }, { status: 404 });
}
