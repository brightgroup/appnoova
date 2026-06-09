import { NextRequest, NextResponse } from "next/server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { analyzeChatConversation, needsChatAnalysis } from "@/lib/text-chat-analysis";
import { buildChatFallbackSummary, normalizeChatMessages } from "@/lib/text-chat-utils";
import { toTextConversationListItem, toTextConversationRecord } from "@/lib/text-conversation-record";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";

export async function GET(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const db = textAgentsAdminClient();
  const id = req.nextUrl.searchParams.get("id");
  const agentId = req.nextUrl.searchParams.get("agent_id");

  if (id) {
    const { data, error } = await db
      .from("text_agent_conversations")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ conversation: null, dbReady: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ conversation: toTextConversationRecord(data), dbReady: true });
  }

  if (!agentId) {
    return NextResponse.json({ error: "agent_id o id requerido" }, { status: 400 });
  }

  const { data, error } = await db
    .from("text_agent_conversations")
    .select(
      "id, text_agent_id, channel, contact_label, messages_count, user_messages_count, duration_sec, credits, status, status_label, user_sentiment, summary, llm_model, metadata, created_at, updated_at, ended_at"
    )
    .eq("user_id", userId)
    .eq("text_agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ conversations: [], dbReady: false });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    conversations: (data ?? []).map(row => toTextConversationListItem(row)),
    dbReady: true
  });
}

/** POST — finaliza una conversación activa (p. ej. al iniciar chat nuevo en pruebas) */
export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const conversationId = String(body.conversation_id ?? "");
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id requerido" }, { status: 400 });
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
      return NextResponse.json({ error: "Tabla text_agent_conversations no existe" }, { status: 503 });
    }
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const now = new Date();
  const messages = normalizeChatMessages(existing.messages);
  const durationSec = Math.max(
    0,
    Math.round((now.getTime() - new Date(String(existing.created_at)).getTime()) / 1000)
  );

  let summary = String(existing.summary ?? "");
  let userSentiment = String(existing.user_sentiment ?? "Neutral");
  let extractedData = typeof existing.extracted_data === "object" && existing.extracted_data
    ? existing.extracted_data as Record<string, unknown>
    : {};
  let metadata = typeof existing.metadata === "object" && existing.metadata
    ? { ...(existing.metadata as Record<string, unknown>) }
    : {};

  if (messages.length >= 2 && needsChatAnalysis({ summary, extracted_data: extractedData, metadata }, messages)) {
    const analysis = await analyzeChatConversation(messages);
    summary = analysis.summary;
    userSentiment = analysis.user_sentiment;
    extractedData = analysis.extracted_data;
    metadata = { ...metadata, analyzed_at: now.toISOString() };
  } else if (!summary) {
    summary = buildChatFallbackSummary(messages);
  }

  const { data, error } = await db
    .from("text_agent_conversations")
    .update({
      status: "ended",
      status_label: "Chat finalizado",
      duration_sec: durationSec,
      summary,
      user_sentiment: userSentiment,
      extracted_data: extractedData,
      metadata,
      ended_at: now.toISOString(),
      updated_at: now.toISOString()
    })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversation: toTextConversationRecord(data) });
}
