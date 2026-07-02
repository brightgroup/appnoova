import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getAuthUserFromRequest, userDisplayName } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { conversationBelongsToOrg } from "@/lib/inbox-org-scope";
import { sendWhatsAppTemplateForConversation } from "@/lib/whatsapp/send-template";
import { toTextConversationRecord } from "@/lib/text-conversation-record";
import { signWhatsAppMessageMedia } from "@/lib/whatsapp/media-storage";
import { WHATSAPP_CONVERSATION_CHANNEL } from "@/lib/whatsapp-channel";

export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "inbox", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const user = await getAuthUserFromRequest(req);
  const actorUserId = user?.id ?? orgCtx.userId;

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
  const belongs = await conversationBelongsToOrg(db, conversationId, orgCtx.organizationId);
  if (!belongs) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const assignedTo = user ? userDisplayName(user) : "Usuario";

  const { data: existing } = await db
    .from("text_agent_conversations")
    .select("user_id")
    .eq("id", conversationId)
    .maybeSingle();
  const ownerUserId = String(existing?.user_id ?? actorUserId);

  const result = await sendWhatsAppTemplateForConversation({
    db,
    userId: ownerUserId,
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
    .maybeSingle();

  if (!updated) return NextResponse.json({ ok: true });

  const record = toTextConversationRecord(updated);
  const messages =
    record.channel === WHATSAPP_CONVERSATION_CHANNEL
      ? await signWhatsAppMessageMedia(db, ownerUserId, record.messages)
      : record.messages;

  return NextResponse.json({ ok: true, conversation: { ...record, messages } });
}
