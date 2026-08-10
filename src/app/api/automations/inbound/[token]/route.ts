import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getConnectionByInboundToken } from "@/lib/automations/connections-db";
import { conversationBelongsToOrg } from "@/lib/inbox-org-scope";
import { sendWhatsAppOutboundForConversation } from "@/lib/whatsapp/process-inbound";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Callback público (sin sesión) que un conector externo (n8n, etc.) llama
 * cuando termina de procesar un evento y quiere reenviar una respuesta al
 * cliente final por el mismo chat de WhatsApp. Autenticado por el token
 * único de la conexión (parte de la URL, generado en automation_connections).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const db = textAgentsAdminClient();

  const connection = await getConnectionByInboundToken(db, token);
  if (!connection) {
    return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const conversationId = String((body as Record<string, unknown>)?.conversation_id ?? "").trim();
  const replyText = String(
    ((body as Record<string, unknown>)?.reply as Record<string, unknown> | undefined)?.text ?? ""
  ).trim();

  if (!conversationId || !replyText) {
    return NextResponse.json({ error: "Faltan conversation_id o reply.text" }, { status: 400 });
  }

  const belongsToOrg = await conversationBelongsToOrg(db, conversationId, connection.organizationId);
  if (!belongsToOrg) {
    return NextResponse.json({ error: "Conversación no encontrada para este conector" }, { status: 404 });
  }

  const { data: conversation } = await db
    .from("text_agent_conversations")
    .select("user_id")
    .eq("id", conversationId)
    .maybeSingle();

  const ownerUserId = conversation?.user_id ? String(conversation.user_id) : null;
  if (!ownerUserId) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const sendResult = await sendWhatsAppOutboundForConversation(db, ownerUserId, conversationId, replyText);

  await db.from("automation_event_log").insert({
    organization_id: connection.organizationId,
    connection_id: connection.id,
    conversation_id: conversationId,
    event_type: "automation.callback",
    status: sendResult.ok ? "responded" : "error",
    error_message: sendResult.ok ? null : (sendResult.error ?? "Error desconocido").slice(0, 500)
  });

  if (!sendResult.ok) {
    const httpStatus = sendResult.code === "session_closed" || sendResult.code === "opted_out" ? 409 : 502;
    return NextResponse.json({ error: sendResult.error ?? "No se pudo enviar" }, { status: httpStatus });
  }

  return NextResponse.json({ ok: true });
}
