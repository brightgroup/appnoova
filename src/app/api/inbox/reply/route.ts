import { NextRequest, NextResponse } from "next/server";
import { persistHumanReply } from "@/lib/text-conversation-persist";
import { toTextConversationRecord } from "@/lib/text-conversation-record";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";
import { getAuthUserFromRequest, userDisplayName } from "@/lib/voice-agents-server";

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

  const { data: updated, error: reloadErr } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (reloadErr || !updated) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ conversation: toTextConversationRecord(updated) });
}
