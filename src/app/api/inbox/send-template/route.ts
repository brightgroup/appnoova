import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";
import { getAuthUserFromRequest, userDisplayName } from "@/lib/voice-agents-server";
import { sendWhatsAppTemplateForConversation } from "@/lib/whatsapp/send-template";
import { toTextConversationRecord } from "@/lib/text-conversation-record";
import { signWhatsAppMessageMedia } from "@/lib/whatsapp/media-storage";
import { WHATSAPP_CONVERSATION_CHANNEL } from "@/lib/whatsapp-channel";

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  const userId = user?.id ?? (await getTextAgentUserIdFromRequest(req));
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const conversationId = String(body.conversation_id ?? "").trim();
  const templateId = String(body.template_id ?? "").trim();
  const variableValues = Array.isArray(body.variables)
    ? body.variables.map((v: unknown) => String(v ?? ""))
    : [];

  if (!conversationId || !templateId) {
    return NextResponse.json({ error: "conversation_id y template_id requeridos" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const assignedTo = user ? userDisplayName(user) : "Usuario";

  const result = await sendWhatsAppTemplateForConversation({
    db,
    userId,
    conversationId,
    templateId,
    variableValues,
    assignedTo
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.code === "opted_out" ? 409 : 502 }
    );
  }

  const { data: updated } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!updated) return NextResponse.json({ ok: true });

  const record = toTextConversationRecord(updated);
  const messages =
    record.channel === WHATSAPP_CONVERSATION_CHANNEL
      ? await signWhatsAppMessageMedia(db, userId, record.messages)
      : record.messages;

  return NextResponse.json({ ok: true, conversation: { ...record, messages } });
}
