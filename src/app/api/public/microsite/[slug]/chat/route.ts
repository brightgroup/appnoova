import { NextRequest, NextResponse } from "next/server";
import { getOrgServiceBlock } from "@/lib/billing/org-service-gate";
import { formatInboxDisplayTitle, makeVisitorLabel } from "@/lib/inbox-utils";
import { syncCrmContactFromWidgetInbound } from "@/lib/crm-contact-sync";
import { runAutoCrmEnrichment } from "@/lib/crm-auto-enrich";
import { getOrgCrmAutofillEnabled } from "@/lib/crm-autofill-settings";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";
import { resolveMicrositeAgentForChat } from "@/lib/microsite-server";
import { resolveWidgetAgentForChat } from "@/lib/widget-server";
import { isLandingWidgetPreview } from "@/lib/landing-widget";
import { WEB_EMBED_CHANNEL } from "@/lib/widget-channel";
import { geminiTextTemperature, isTextAgentHumanOnly } from "@/lib/text-agent-form";
import { generateTextAgentReply } from "@/lib/text-agent-generate";
import { persistChatTurn, persistUserMessageOnly } from "@/lib/text-conversation-persist";
import {
  buildAgentThreadContext,
  buildRollingSummary,
  persistThreadContextSummary,
  readThreadContextSummary,
  type ThreadContextSummary
} from "@/lib/ai-thread-context";
import { normalizeChatMessages } from "@/lib/text-chat-utils";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { resolvePublicChatChannel } from "@/lib/widget-channel";
import { getOriApiKey } from "@/lib/google-ai";
import { providerForLlmModel } from "@/lib/billing/pricing";
import { buildDataTableContext } from "@/lib/data-tables/retrieve";
import { mergeDataTableContext, resolveProductCards } from "@/lib/data-tables/format-context";
import { enforceCatalogFacts } from "@/lib/data-tables/catalog-guard";
import {
  previousUserTextForCatalog,
  recentAssistantTextForCatalog
} from "@/lib/data-tables/conversation-text";
import {
  detectAssistantHandoffOffer,
  detectUserHandoffIntent,
  escalateConversationToHuman,
  HANDOFF_VISITOR_REPLY
} from "@/lib/text-handoff";
import {
  checkBillingForUser,
  recordUsageSafe,
  resolveOrgIdForUser
} from "@/lib/billing/meter";
import { notifyPushForOrg } from "@/lib/push/send";
import { resolveOrgActiveWhatsAppChannel } from "@/lib/text-notify-team";
import { getActiveCalendarConnection } from "@/lib/google-calendar/connections-db";
import { getWooCommerceConnection } from "@/lib/woocommerce/connections-db";
import { getOrgBusinessHours } from "@/lib/scheduling/business-hours-db";
import { normalizeQuotingRules } from "@/lib/insurers/quoting-rules";
import { getAllRamoCampoDefinitionsParaCotizar } from "@/lib/insurers/quote-guidance";
import { getRamosOfrecidosLabels, mergeRamosOfrecidosContext } from "@/lib/insurers/ramos-ofrecidos-context";

const PUBLIC_BILLING_FALLBACK =
  "¡Gracias por tu mensaje! En este momento no puedo responder automáticamente, pero un asesor te contactará muy pronto.";

interface ChatMessage {
  role: "user" | "assistant" | "human";
  content: string;
}

/**
 * A diferencia de WhatsApp (sync-and-enrich vive en process-inbound.ts), este canal
 * nunca tuvo contacto/lead de CRM conectados — un visitante de Mi Link o del widget
 * podía chatear sin que se creara ficha ni pipeline. No hay teléfono de entrada, así
 * que el contacto arranca solo con un nombre de visitante y se completa con la misma
 * IA de enriquecimiento que ya usa WhatsApp.
 */
async function syncAndEnrichCrmFromWidget(
  db: ReturnType<typeof textAgentsAdminClient>,
  userId: string,
  organizationId: string | null,
  conversationId: string,
  channel: string,
  visitorText: string
): Promise<void> {
  try {
    if (organizationId && !(await getOrgCrmAutofillEnabled(db, organizationId))) return;

    const displayName = formatInboxDisplayTitle("", channel, conversationId);
    const { contactId, error } = await syncCrmContactFromWidgetInbound(db, {
      userId,
      conversationId,
      displayName,
      channel
    });
    if (error) console.error("[microsite/chat] crm sync:", error);
    if (!contactId) return;

    // Solo "telefono" (no "whatsapp"): esa columna tiene un índice único por
    // usuario y un visitante puede escribir un número que ya es el WhatsApp de
    // otro contacto — eso rompía el update completo (ver [crm/enrich] logs).
    await runAutoCrmEnrichment(
      db,
      userId,
      contactId,
      conversationId,
      { text: visitorText, hasMedia: false },
      ["telefono"]
    );
  } catch (err) {
    console.error("[microsite/chat] crm sync/enrich:", err);
  }
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
  const humanOnly = isTextAgentHumanOnly(agent);

  // Cuenta suspendida/desactivada: el canal público deja de atender.
  if (await getOrgServiceBlock(db, await resolveOrgIdForUser(db, userId))) {
    return NextResponse.json({ error: "Canal no disponible" }, { status: 404 });
  }

  let existingHandoff: "human" | "ai" | null = null;
  let priorSummary: ThreadContextSummary | null = null;
  if (conversationId) {
    const { data: existing } = await db
      .from("text_agent_conversations")
      .select("handoff_mode, metadata")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      existingHandoff = existing.handoff_mode === "human" ? "human" : "ai";
      priorSummary = readThreadContextSummary(existing.metadata);
    }
  }

  if (humanOnly || existingHandoff === "human") {
    const visitorText = lastUser.content.trim();
    const contactLabel = conversationId ? undefined : makeVisitorLabel();
    const persisted = await persistUserMessageOnly({
      db,
      userId,
      agentId: String(agent.id),
      agentName: String(agent.name),
      conversationId,
      userMessage: visitorText,
      llmModel: model,
      channel,
      contactLabel,
      bumpUnread: true,
      handoffMode: "human"
    });

    if (persisted.error) {
      return NextResponse.json({ error: persisted.error }, { status: 500 });
    }

    const savedId = persisted.conversationId || conversationId;
    const pushOrgId = await resolveOrgIdForUser(db, userId);
    const firstHumanOnlyQueue = humanOnly && existingHandoff !== "human";

    if (firstHumanOnlyQueue && savedId) {
      const waChannel = pushOrgId ? await resolveOrgActiveWhatsAppChannel(db, pushOrgId) : null;
      await escalateConversationToHuman({
        db,
        userId,
        conversationId: savedId,
        organizationId: pushOrgId,
        reason: "human_only",
        channel,
        agentName: String(agent.name),
        contactLabel: contactLabel ?? null,
        visitorMessage: visitorText,
        notifyRules: agent.notify_rules,
        outboundWhatsAppChannel: waChannel
      });
    } else if (pushOrgId && savedId) {
      void notifyPushForOrg(pushOrgId, {
        title: "Nuevo mensaje",
        body: visitorText.length > 120 ? `${visitorText.slice(0, 120)}…` : visitorText,
        url: `/m/chats/${savedId}`,
        tag: `msg-${savedId}`
      });
    }

    return NextResponse.json({
      handoff: true,
      handoff_mode: "human",
      conversation_id: savedId
    });
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

  const waChannelForHandoff = billing.organizationId
    ? await resolveOrgActiveWhatsAppChannel(db, billing.organizationId)
    : null;

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
        visitorMessage: visitorText,
        notifyRules: agent.notify_rules,
        outboundWhatsAppChannel: waChannelForHandoff
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

  let dataTableContext = { text: "", rows: [], columns: [] } as Awaited<ReturnType<typeof buildDataTableContext>>;
  if (agent.data_table_id) {
    dataTableContext = await buildDataTableContext(
      db,
      String(agent.data_table_id),
      visitorText,
      billing.organizationId,
      {
        conversationText: recentAssistantTextForCatalog(messages),
        previousUserText: previousUserTextForCatalog(messages)
      }
    );
  }
  const promptWithCatalog = mergeDataTableContext(
    String(agent.prompt),
    dataTableContext.text || null,
    { tableLinked: Boolean(agent.data_table_id) }
  );
  const ramosOfrecidos = billing.organizationId ? await getRamosOfrecidosLabels(db, billing.organizationId) : [];
  const temporal = buildColombiaTemporalContext();

  // Mismo tratamiento del hilo que en WhatsApp: turnos del asesor humano
  // etiquetados y ventana con nota rodante — ver `ai-thread-context`.
  let threadContext = buildAgentThreadContext(messages, priorSummary);
  if (conversationId && threadContext.summarizeUpto !== null) {
    const nextSummary = await buildRollingSummary(messages, priorSummary, threadContext.summarizeUpto);
    if (nextSummary) {
      await persistThreadContextSummary(db, conversationId, userId, nextSummary);
      threadContext = buildAgentThreadContext(messages, nextSummary);
    }
  }

  const systemInstruction = [
    temporal.promptBlock,
    mergeRamosOfrecidosContext(mergeCompanyContext(promptWithCatalog, companyContextText), ramosOfrecidos),
    threadContext.contextBlock
  ]
    .filter(Boolean)
    .join("\n\n");
  // Solo las instrucciones, SIN la tabla del catálogo: es lo que el guardián
  // toma como "importes y enlaces que el negocio autoriza". Si se le pasara el
  // prompt completo, la propia tabla incrustada daría por bueno cualquier
  // precio del catálogo y la validación por producto dejaría de servir.
  const catalogGuardPromptText = `${String(agent.prompt)}\n\n${companyContextText}`;
  const temperature = geminiTextTemperature(Number(agent.temperature) || 0.7);
  const maxOutputTokens = Number(agent.max_output_tokens) || 1024;
  const contactLabel = conversationId ? undefined : makeVisitorLabel();
  const waChannel = waChannelForHandoff;
  const calendarConnection = billing.organizationId
    ? await getActiveCalendarConnection(db, billing.organizationId)
    : null;
  const wooCommerceConnection = billing.organizationId
    ? await getWooCommerceConnection(db, billing.organizationId)
    : null;
  const businessHours = billing.organizationId
    ? await getOrgBusinessHours(db, billing.organizationId)
    : undefined;
  const ramoCampos =
    billing.organizationId && normalizeQuotingRules(agent.quoting_rules).enabled
      ? await getAllRamoCampoDefinitionsParaCotizar(db, billing.organizationId)
      : {};

  try {
    const generated = await generateTextAgentReply({
      model,
      systemInstruction,
      messages: threadContext.messages,
      temperature,
      maxOutputTokens,
      notifyRules: agent.notify_rules,
      schedulingRules: agent.scheduling_rules,
      businessHours,
      calendarConnection,
      quotingRules: agent.quoting_rules,
      ramoCampos,
      wooCommerceConnection,
      wooCommerceRules: agent.woocommerce_rules,
      toolContext: {
        db,
        organizationId: billing.organizationId,
        conversationId: conversationId ?? null,
        channel,
        agentId: String(agent.id),
        agentType: "text",
        agentName: String(agent.name),
        contactLabel: contactLabel ?? null,
        outboundWhatsAppChannel: waChannel
      }
    });

    const guarded = enforceCatalogFacts(
      resolveProductCards(generated.text, dataTableContext.rows, dataTableContext.columns),
      dataTableContext.rows,
      dataTableContext.columns,
      catalogGuardPromptText
    );
    if (guarded.violations.length) {
      console.warn(
        "[microsite/chat] datos corregidos contra el catálogo:",
        JSON.stringify({ agentId: agent.id, violations: guarded.violations })
      );
    }
    const reply = guarded.text;

    let savedConversationId = conversationId ?? null;
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

    if (savedConversationId) {
      void syncAndEnrichCrmFromWidget(
        db,
        userId,
        billing.organizationId,
        savedConversationId,
        channel,
        visitorText
      );
    }

    // `guarded.needsHuman`: el agente afirmó un dato que no existe en el
    // catálogo y hubo que eliminarlo — el visitante se queda sin respuesta.
    const aiHandoff = guarded.needsHuman || detectAssistantHandoffOffer(reply);
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
        visitorMessage: visitorText,
        notifyRules: agent.notify_rules,
        outboundWhatsAppChannel: waChannelForHandoff
      });
    }

    if (billing.organizationId) {
      // Motor real, no el elegido por el agente — pueden diferir tras un
      // failover (generateTextAgentReply). El precio al cliente no cambia.
      const actualEngine = generated.engine ?? model;
      await recordUsageSafe({
        db,
        organizationId: billing.organizationId,
        userId,
        eventType: billingEventType,
        channel,
        provider: providerForLlmModel(actualEngine),
        model: actualEngine,
        gemini: generated.usage,
        referenceType: "text_agent_conversation",
        referenceId: savedConversationId ?? undefined
      });
    }

    return NextResponse.json({
      reply,
      conversation_id: savedConversationId,
      // El front solo renderiza algo para las tools con tarjeta propia (ver
      // AutoQuoteCard) — el resto de ALL_TEXT_AGENT_TOOLS (notify_team,
      // agendamiento) no tiene nada que mostrar aparte de la prosa del modelo.
      tool_calls: generated.toolResults,
      ...(aiHandoff ? { handoff: true, handoff_mode: "human" as const } : {})
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al consultar el agente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
