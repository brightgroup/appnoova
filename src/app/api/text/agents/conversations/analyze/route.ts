import { NextRequest, NextResponse } from "next/server";
import { analyzeChatConversation } from "@/lib/text-chat-analysis";
import { normalizeChatMessages } from "@/lib/text-chat-utils";
import { toTextConversationRecord } from "@/lib/text-conversation-record";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";

export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const { data: existing, error: fetchErr } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const messages = normalizeChatMessages(existing.messages);
  const analysis = await analyzeChatConversation(messages);
  const now = new Date().toISOString();
  const metadata = {
    ...(typeof existing.metadata === "object" && existing.metadata ? existing.metadata as Record<string, unknown> : {}),
    analyzed_at: now
  };

  const { data, error } = await db
    .from("text_agent_conversations")
    .update({
      summary: analysis.summary,
      user_sentiment: analysis.user_sentiment,
      extracted_data: analysis.extracted_data,
      metadata,
      updated_at: now
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversation: toTextConversationRecord(data) });
}
