import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import { resolveMicrositeAgentForChat } from "@/lib/microsite-server";
import { geminiTextTemperature } from "@/lib/text-agent-form";
import { persistChatTurn } from "@/lib/text-conversation-persist";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getOriApiKey } from "@/lib/google-ai";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

  const apiKey = getOriApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "Servicio no disponible temporalmente." }, { status: 503 });
  }

  const body = await req.json();
  const messages = (body.messages ?? []) as ChatMessage[];
  const conversationId = body.conversation_id as string | undefined;
  const lastUser = [...messages].reverse().find(m => m.role === "user");

  if (!lastUser?.content?.trim()) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  }

  const { agent, companyContextText, userId, microsite } = resolved;
  const systemInstruction = mergeCompanyContext(String(agent.prompt), companyContextText);
  const model = String(agent.llm_model || "gemini-2.5-flash");
  const temperature = geminiTextTemperature(Number(agent.temperature) || 0.7);
  const maxOutputTokens = Number(agent.max_output_tokens) || 2048;

  const ai = new GoogleGenAI({ apiKey });
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
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

    const db = textAgentsAdminClient();
    let savedConversationId = conversationId ?? null;
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
        contactLabel: microsite.slug
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
