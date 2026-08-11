import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getConnectionByInboundToken } from "@/lib/automations/connections-db";
import { getWebhookTriggerByToken } from "@/lib/automations/webhook-triggers-db";
import { getWorkflowById } from "@/lib/automations/workflows-db";
import { findSendMessageTargets, resolveJsonPath } from "@/lib/automations/node-types";
import { conversationBelongsToOrg } from "@/lib/inbox-org-scope";
import { sendWhatsAppOutboundForConversation } from "@/lib/whatsapp/process-inbound";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { params: Promise<{ token: string }> };

const LOGGED_BODY_MAX_CHARS = 8000;

interface DeliverParams {
  organizationId: string;
  conversationId: string;
  replyText: string;
  connectionId?: string;
  workflowId?: string;
  /** JSON crudo recibido en este callback, tal como lo mandó el sistema externo — para inspección en la UI. */
  requestBody: string;
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

  const sendResult = await sendWhatsAppOutboundForConversation(db, ownerUserId, params.conversationId, params.replyText);

  await db.from("automation_event_log").insert({
    organization_id: params.organizationId,
    connection_id: params.connectionId ?? null,
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

/**
 * Callback público (sin sesión) para el "webhook inverso": un sistema externo
 * (n8n u otro) llama esta URL para reenviar una respuesta al cliente final
 * por el mismo chat de WhatsApp. El token de la URL puede resolver a dos
 * cosas distintas:
 *  1. Una `automation_connection` (el callback_url que Noova ya incluye solo
 *     por conectar — modo sin fricción, siempre espera {conversation_id, reply:{text}}).
 *  2. Un nodo `trigger.webhook` dentro de un workflow (URL propia generada al
 *     agregar el nodo) — el mapeo de campos lo define cada nodo
 *     `action.send_whatsapp_message` conectado a ese disparador.
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

  const connection = await getConnectionByInboundToken(db, token);
  if (connection) {
    const conversationId = String((body as Record<string, unknown>)?.conversation_id ?? "").trim();
    const replyText = String(
      ((body as Record<string, unknown>)?.reply as Record<string, unknown> | undefined)?.text ?? ""
    ).trim();
    if (!conversationId || !replyText) {
      return NextResponse.json({ error: "Faltan conversation_id o reply.text" }, { status: 400 });
    }
    return deliverReply(db, {
      organizationId: connection.organizationId,
      conversationId,
      replyText,
      connectionId: connection.id,
      requestBody: rawBody
    });
  }

  const trigger = await getWebhookTriggerByToken(db, token);
  if (trigger) {
    const workflow = await getWorkflowById(db, trigger.organizationId, trigger.workflowId);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow no encontrado" }, { status: 404 });
    }
    const targets = findSendMessageTargets(workflow.graph, trigger.nodeId);
    if (targets.length === 0) {
      return NextResponse.json(
        { error: "Este webhook no está conectado a ningún nodo de 'Enviar mensaje de WhatsApp'" },
        { status: 422 }
      );
    }

    let lastResponse: NextResponse | null = null;
    for (const target of targets) {
      const conversationId = resolveJsonPath(body, target.conversationIdPath)?.trim();
      const replyText = resolveJsonPath(body, target.messageTextPath)?.trim();
      if (!conversationId || !replyText) {
        lastResponse = NextResponse.json(
          { error: `Faltan '${target.conversationIdPath}' o '${target.messageTextPath}' en el JSON recibido` },
          { status: 400 }
        );
        continue;
      }
      lastResponse = await deliverReply(db, {
        organizationId: trigger.organizationId,
        conversationId,
        replyText,
        workflowId: trigger.workflowId,
        requestBody: rawBody
      });
    }
    return lastResponse ?? NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Token inválido" }, { status: 404 });
}
