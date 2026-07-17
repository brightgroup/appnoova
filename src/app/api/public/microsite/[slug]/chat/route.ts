import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { makeVisitorLabel } from "@/lib/inbox-utils";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";
import { resolveMicrositeAgentForChat } from "@/lib/microsite-server";
import { resolveWidgetAgentForChat } from "@/lib/widget-server";
import { isLandingWidgetPreview } from "@/lib/landing-widget";
import { WEB_EMBED_CHANNEL } from "@/lib/widget-channel";
import { geminiTextTemperature } from "@/lib/text-agent-form";
import { persistChatTurn, persistUserMessageOnly } from "@/lib/text-conversation-persist";
import { normalizeChatMessages } from "@/lib/text-chat-utils";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { resolvePublicChatChannel } from "@/lib/widget-channel";
import { getOriApiKey } from "@/lib/google-ai";
import { buildDataTableContext } from "@/lib/data-tables/retrieve";
import { mergeDataTableContext } from "@/lib/data-tables/format-context";
import {
  detectAssistantHandoffOffer,
  detectUserHandoffIntent,
  escalateConversationToHuman,
  HANDOFF_VISITOR_REPLY
} from "@/lib/text-handoff";
import {
  checkBillingForUser,
  readGeminiUsage,
  recordUsageSafe
} from "@/lib/billing/meter";

const PUBLIC_BILLING_FALLBACK =
  "¡Gracias por tu mensaje! En este momento no puedo responder automáticamente, pero un asesor te contactará muy pronto.";

interface ChatMessage {
  role: "user" | "assistant" | "human";
  content: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const channelParam = req.nextUrl.searchParams.get("channel");
  const preview = req.nextUrl.searchParams.get("preview");
  const widgetPreview = channelParam === WEB_EMBED_CHANNEL && isLandingWidgetPreview(slug, preview);
  const resolved =
    channelParam === WEB_EMBED_CHANNEL
      ? await resolveWidgetAgentForChat(slug, { requirePublished: !widgetPreview })
      : await resolveMicrositeAgentForChat(slug);
  if (!resolved) {
    return NextResponse.json({ error: "Canal no disponible" }, { status: 404 });
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
  const body = await req.json();
  const channel = resolvePublicChatChannel(body.channel);
  const widgetPreview = channel === WEB_EMBED_CHANNEL && isLandingWidgetPreview(slug, body.preview);
  const resolved =
    channel === WEB_EMBED_CHANNEL
      ? await resolveWidgetAgentForChat(slug, { requirePublished: !widgetPreview })
      : await resolveMicrositeAgentForChat(slug);

  if (!resolved) {
    return NextResponse.json({ error: "Canal no disponible" }, { status: 404 });
  }

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
      const persisted = await persistUserMessageOnly({
        db,
        userId,
        agentId: String(agent.id),
        agentName: String(agent.name),
        conversationId,
        userMessage: lastUser.content.trim(),
        llmModel: model,
        channel,
        bumpUnread: true
      });

      if (persisted.error) {
        return NextResponse.json({ error: persisted.error }, { status: 500 });
      }

      // Sin reply: un asesor ya atiende; el visitante verá respuestas vía polling (rol human).
      return NextResponse.json({
        handoff: true,
        handoff_mode: "human",
        conversation_id: persisted.conversationId || conversationId
      });
    }
  }

  const apiKey = getOriApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "Servicio no disponible temporalmente." }, { status: 503 });
  }

  // —— Facturación: si la org no tiene saldo, no gastamos IA ——
  const billing = await checkBillingForUser(db, userId);
  if (!billing.allowed) {
    const contactLabel = conversationId ? undefined : makeVisitorLabel();
    const persisted = await persistChatTurn({
      db,
      userId,
      agentId: String(agent.id),
      agentName: String(agent.name),
      conversationId,
      userMessage: lastUser.content.trim(),
      assistantReply: PUBLIC_BILLING_FALLBACK,
      llmModel: model,
      channel,
      contactLabel
    });
    return NextResponse.json({
      reply: PUBLIC_BILLING_FALLBACK,
      conversation_id: persisted.conversationId || conversationId || null
    });
  }

  const visitorText = lastUser.content.trim();
  if (detectUserHandoffIntent(visitorText)) {
    const contactLabel = conversationId ? undefined : makeVisitorLabel();
    const persisted = await persistChatTurn({
      db,
      userId,
      agentId: String(agent.id),
      agentName: String(agent.name),
      conversationId,
      userMessage: visitorText,
      assistantReply: HANDOFF_VISITOR_REPLY,
      llmModel: model,
      channel,
      contactLabel
    });
    const savedId = persisted.conversationId || conversationId || null;
    if (savedId) {
      await escalateConversationToHuman({
        db,
        userId,
        conversationId: savedId,
        organizationId: billing.organizationId,
        reason: "user_request",
        channel,
        agentName: String(agent.name),
        contactLabel: contactLabel ?? null,
        visitorMessage: visitorText
      });
    }
    return NextResponse.json({
      reply: HANDOFF_VISITOR_REPLY,
      handoff: true,
      handoff_mode: "human",
      conversation_id: savedId
    });
  }

  const billingEventType = channel === WEB_EMBED_CHANNEL ? "widget" : "milink";

  let dataTableContext = "";
  if (agent.data_table_id) {
    dataTableContext = await buildDataTableContext(
      db,
      String(agent.data_table_id),
      visitorText,
      billing.organizationId
    );
  }
  const promptWithCatalog = mergeDataTableContext(
    String(agent.prompt),
    dataTableContext || null,
    { tableLinked: Boolean(agent.data_table_id) }
  );
  const temporal = buildColombiaTemporalContext();
  const systemInstruction = `${temporal.promptBlock}\n\n${mergeCompanyContext(promptWithCatalog, companyContextText)}`;
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
        userMessage: visitorText,
        assistantReply: reply,
        llmModel: model,
        channel,
        contactLabel
      });
      if (persisted.conversationId) savedConversationId = persisted.conversationId;
    } catch (err) {
      console.error("[public/microsite/chat] persist:", err);
    }

    const aiHandoff = detectAssistantHandoffOffer(reply);
    if (aiHandoff && savedConversationId) {
      await escalateConversationToHuman({
        db,
        userId,
        conversationId: savedConversationId,
        organizationId: billing.organizationId,
        reason: "ai_escalation",
        channel,
        agentName: String(agent.name),
        contactLabel: contactLabel ?? null,
        visitorMessage: visitorText
      });
    }

    if (billing.organizationId) {
      await recordUsageSafe({
        db,
        organizationId: billing.organizationId,
        userId,
        eventType: billingEventType,
        channel,
        provider: "google",
        model,
        gemini: readGeminiUsage(response),
        referenceType: "text_agent_conversation",
        referenceId: savedConversationId ?? undefined
      });
    }

    return NextResponse.json({
      reply,
      conversation_id: savedConversationId,
      ...(aiHandoff ? { handoff: true, handoff_mode: "human" as const } : {})
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al consultar el agente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
