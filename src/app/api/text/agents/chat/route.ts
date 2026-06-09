import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getOriApiKey } from "@/lib/google-ai";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import { geminiTextTemperature } from "@/lib/text-agent-form";
import { persistChatTurn } from "@/lib/text-conversation-persist";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const apiKey = getOriApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Falta ORI_GOOGLE_AI_KEY en .env.local. Usa la misma clave de Ori para pruebas de agentes de texto."
      },
      { status: 500 }
    );
  }

  const body = await req.json();
  const agentId = body.agent_id as string | undefined;
  const conversationId = body.conversation_id as string | undefined;
  const messages = (body.messages ?? []) as ChatMessage[];
  const lastUser = [...messages].reverse().find(m => m.role === "user");

  if (!agentId) {
    return NextResponse.json({ error: "agent_id requerido" }, { status: 400 });
  }

  if (!lastUser?.content?.trim()) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const { data: agent, error: agentErr } = await db
    .from("text_agents")
    .select("*")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (agentErr) {
    return NextResponse.json({ error: agentErr.message }, { status: 500 });
  }
  if (!agent) {
    return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  }

  let companyContextText = "";
  if (agent.company_context_id) {
    const { data } = await db
      .from("company_contexts")
      .select("content")
      .eq("id", agent.company_context_id)
      .eq("user_id", userId)
      .maybeSingle();
    companyContextText = data?.content ?? "";
  }

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
      config: {
        systemInstruction,
        temperature,
        maxOutputTokens
      }
    });

    const reply = response.text?.trim();
    if (!reply) {
      return NextResponse.json({ error: "No se generó respuesta" }, { status: 502 });
    }

    let savedConversationId = conversationId ?? null;
    try {
      const persisted = await persistChatTurn({
        db,
        userId,
        agentId,
        agentName: String(agent.name),
        conversationId,
        userMessage: lastUser.content.trim(),
        assistantReply: reply,
        llmModel: model
      });
      if (persisted.conversationId) {
        savedConversationId = persisted.conversationId;
      }
    } catch (persistErr) {
      console.error("[text/chat] persist:", persistErr);
    }

    return NextResponse.json({
      reply,
      model,
      conversation_id: savedConversationId
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al consultar el agente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
