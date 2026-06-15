import { NextRequest, NextResponse } from "next/server";
import { syncCrmFromConversationRow } from "@/lib/crm-contact-backfill";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { toCrmContact } from "@/lib/crm-record";

/**
 * Sincroniza manualmente la ficha CRM desde una conversación WhatsApp del inbox.
 */
export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const conversationId = String(body.conversation_id ?? "").trim();
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id es requerido" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const { data: conv, error: convErr } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
  if (!conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

  const result = await syncCrmFromConversationRow(db, userId, conv as Record<string, unknown>, {
    enrich: true
  });

  if (result.skipped) {
    return NextResponse.json(
      { error: result.error ?? "No es una conversación WhatsApp sincronizable" },
      { status: 400 }
    );
  }

  if (!result.contactId) {
    return NextResponse.json({ error: result.error ?? "No se pudo sincronizar" }, { status: 500 });
  }

  const { data: row } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", result.contactId)
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({
    contact: row ? toCrmContact(row) : null,
    contact_id: result.contactId
  });
}
