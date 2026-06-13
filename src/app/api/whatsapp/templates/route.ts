import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";
import { getAuthUserFromRequest } from "@/lib/voice-agents-server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { WHATSAPP_CONVERSATION_CHANNEL } from "@/lib/whatsapp-channel";
import { toWhatsAppTemplateRecord } from "@/lib/whatsapp/template-record";

/** Plantillas activas del canal WhatsApp de una conversación. */
export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  const userId = user?.id ?? (await getTextAgentUserIdFromRequest(req));
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const conversationId = req.nextUrl.searchParams.get("conversation_id");
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id requerido" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const { data: conv, error: convErr } = await db
    .from("text_agent_conversations")
    .select("channel, metadata")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  if (String(conv.channel) !== WHATSAPP_CONVERSATION_CHANNEL) {
    return NextResponse.json({ templates: [] });
  }

  const meta = (conv.metadata ?? {}) as Record<string, unknown>;
  const channelId = meta.whatsapp_channel_id ? String(meta.whatsapp_channel_id) : "";
  if (!channelId) {
    return NextResponse.json({ templates: [] });
  }

  const { data, error } = await db
    .from("whatsapp_templates")
    .select("*")
    .eq("user_id", userId)
    .eq("whatsapp_channel_id", channelId)
    .in("status", ["approved", "active"])
    .order("template_name");

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ templates: [], dbReady: false }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    templates: (data ?? []).map(row => toWhatsAppTemplateRecord(row)),
    dbReady: true
  });
}
