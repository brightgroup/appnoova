import { NextRequest, NextResponse } from "next/server";
import { persistHumanReply } from "@/lib/text-conversation-persist";
import { sendWhatsAppOutboundForConversation } from "@/lib/whatsapp/process-inbound";
import { toTextConversationRecord } from "@/lib/text-conversation-record";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";
import { getAuthUserFromRequest, userDisplayName } from "@/lib/voice-agents-server";
import { WHATSAPP_CONVERSATION_CHANNEL } from "@/lib/whatsapp-channel";
import {
  canSendWhatsAppSessionMessage,
  readWhatsAppMeta
} from "@/lib/whatsapp/compliance";
import { normalizeChatMessages } from "@/lib/text-chat-utils";
import { signWhatsAppMessageMedia } from "@/lib/whatsapp/media-storage";
import { enrichCrmLeadForConversationId } from "@/lib/crm-lead-enrich";
import { enrichCrmContactFromWhatsAppConversation } from "@/lib/crm-contact-enrich";

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  const userId = user?.id ?? (await getTextAgentUserIdFromRequest(req));
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const conversationId = String(body.conversation_id ?? "");
  const content = String(body.content ?? "").trim();

  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id requerido" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const { data: existing, error: fetchErr } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) {
    if (isMissingTableError(fetchErr)) {
      return NextResponse.json({ error: "Ejecuta la migración 016_inbox_handoff en Supabase" }, { status: 503 });
    }
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  if (existing.handoff_mode !== "human") {
    return NextResponse.json(
      { error: "Asigna la conversación a un humano para responder" },
      { status: 400 }
    );
  }

  const assignedTo = existing.assigned_to
    ? String(existing.assigned_to)
    : user ? userDisplayName(user) : "Usuario";

  if (String(existing.channel) === WHATSAPP_CONVERSATION_CHANNEL) {
    const waMeta = readWhatsAppMeta(
      (existing.metadata ?? {}) as Record<string, unknown>,
      normalizeChatMessages(existing.messages)
    );
    const gate = canSendWhatsAppSessionMessage({
      lastInboundAt: waMeta.lastInboundAt,
      optedOut: waMeta.optedOut
    });
    if (!gate.allowed) {
      return NextResponse.json(
        { error: gate.reason, code: gate.code },
        { status: 409 }
      );
    }
  }

  const result = await persistHumanReply({
    db,
    userId,
    conversationId,
    content,
    assignedTo
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "No se pudo enviar" }, { status: 500 });
  }

  const waSend = await sendWhatsAppOutboundForConversation(db, userId, conversationId, content);
  if (!waSend.ok) {
    return NextResponse.json(
      {
        error: waSend.error ?? "Mensaje guardado pero no se pudo enviar por WhatsApp",
        code: waSend.code
      },
      { status: waSend.code === "session_closed" || waSend.code === "opted_out" ? 409 : 502 }
    );
  }

  const { data: linkedContact } = await db
    .from("crm_contacts")
    .select("id")
    .eq("user_id", userId)
    .eq("inbox_conversation_id", conversationId)
    .maybeSingle();

  if (linkedContact?.id) {
    void enrichCrmContactFromWhatsAppConversation(
      db,
      userId,
      String(linkedContact.id),
      conversationId
    ).catch(err => console.error("[inbox/reply] contact enrich:", err));
    void enrichCrmLeadForConversationId(db, userId, conversationId).catch(err =>
      console.error("[inbox/reply] lead enrich:", err)
    );
  }

  const { data: updated, error: reloadErr } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (reloadErr || !updated) {
    return NextResponse.json({ ok: true });
  }

  const record = toTextConversationRecord(updated);
  const messages =
    record.channel === WHATSAPP_CONVERSATION_CHANNEL
      ? await signWhatsAppMessageMedia(db, userId, record.messages)
      : record.messages;

  return NextResponse.json({ conversation: { ...record, messages } });
}
