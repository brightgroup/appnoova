import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { makeVisitorLabel } from "@/lib/inbox-utils";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import { resolveMicrositeAgentForChat } from "@/lib/microsite-server";
import { geminiTextTemperature } from "@/lib/text-agent-form";
import { persistChatTurn, persistUserMessageOnly } from "@/lib/text-conversation-persist";
import { normalizeChatMessages } from "@/lib/text-chat-utils";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getOriApiKey } from "@/lib/google-ai";

interface ChatMessage {
  role: "user" | "assistant" | "human";
  content: string;
}

const HANDOFF_REPLY =
  "Un asesor humano te atenderá en breve. Gracias por tu paciencia.";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const resolved = await resolveMicrositeAgentForChat(slug);
  if (!resolved) {
    return NextResponse.json({ error: "Micrositio no disponible" }, { status: 404 });
  }

  const conversationId = req.nextUrl.searchParams.get("conversation_id");
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_id requerido" }, { status: 400 });
  }

  const sinceIndex = Math.max(0, Number(req.nextUrl.searchParams.get("since_index") ?? "0") || 0);
  const db = textAgentsAdminClient();
  const { data, error } = await db
    .from("text_agent_conversations")
    .select("messages, handoff_mode, assigned_to")
    .eq("id", conversationId)
    .eq("user_id", resolved.userId)
    .eq("text_agent_id", String(resolved.agent.id))
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const messages = normalizeChatMessages(data.messages);
  return NextResponse.json({
    messages: messages.slice(sinceIndex),
    total: messages.length,
    handoff_mode: data.handoff_mode === "human" ? "human" : "ai",
    assigned_to: data.assigned_to ? String(data.assigned_to) : null
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const resolved = await resolveMicrositeAgentForChat(slug);

  if (!resolved) {
    return NextResponse.json({ error: "Micrositio no disponible" }, { status: 404 });
  }

  const body = await req.json();
  const messages = (body.messages ?? []) as ChatMessage[];
  const conversationId = body.conversation_id as string | undefined;
  const lastUser = [...messages].reverse().find(m => m.role === "user");

  if (!lastUser?.content?.trim()) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  }

  const { agent, companyContextText, userId } = resolved;
  const model = String(agent.llm_model || "gemini-2.5-flash");
  const db = textAgentsAdminClient();

  if (conversationId) {
    const { data: existing } = await db
      .from("text_agent_conversations")
      .select("handoff_mode")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.handoff_mode === "human") {
      const contactLabel = makeVisitorLabel();
      const persisted = await persistUserMessageOnly({
        db,
        userId,
        agentId: String(agent.id),
        agentName: String(agent.name),
        conversationId,
        userMessage: lastUser.content.trim(),
        llmModel: model,
        channel: "web_widget",
        contactLabel
      });

      return NextResponse.json({
        reply: HANDOFF_REPLY,
        handoff: true,
        conversation_id: persisted.conversationId || conversationId
      });
    }
  }

  const apiKey = getOriApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "Servicio no disponible temporalmente." }, { status: 503 });
  }

  const systemInstruction = mergeCompanyContext(String(agent.prompt), companyContextText);
  const temperature = geminiTextTemperature(Number(agent.temperature) || 0.7);
  const maxOutputTokens = Number(agent.max_output_tokens) || 2048;

  const ai = new GoogleGenAI({ apiKey });
  const contents = messages.map(m => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }]
  }));

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction, temperature, maxOutputTokens }
    });

    const reply = response.text?.trim();
    if (!reply) {
      return NextResponse.json({ error: "No se generó respuesta" }, { status: 502 });
    }

    let savedConversationId = conversationId ?? null;
    const contactLabel = conversationId ? undefined : makeVisitorLabel();
    try {
      const persisted = await persistChatTurn({
        db,
        userId,
        agentId: String(agent.id),
        agentName: String(agent.name),
        conversationId,
        userMessage: lastUser.content.trim(),
        assistantReply: reply,
        llmModel: model,
        channel: "web_widget",
        contactLabel
      });
      if (persisted.conversationId) savedConversationId = persisted.conversationId;
    } catch (err) {
      console.error("[public/microsite/chat] persist:", err);
    }

    return NextResponse.json({
      reply,
      conversation_id: savedConversationId
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al consultar el agente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
