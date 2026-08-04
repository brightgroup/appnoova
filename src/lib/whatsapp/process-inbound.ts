import type { SupabaseClient } from "@supabase/supabase-js";
import { getOriApiKey } from "@/lib/google-ai";
import { mergeCompanyContext } from "@/lib/merge-company-context";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";
import { buildDataTableContext } from "@/lib/data-tables/retrieve";
import { mergeDataTableContext, resolveProductCards } from "@/lib/data-tables/format-context";
import { enforceCatalogFacts } from "@/lib/data-tables/catalog-guard";
import {
  previousUserTextForCatalog,
  recentAssistantTextForCatalog
} from "@/lib/data-tables/conversation-text";
import { geminiTextTemperature } from "@/lib/text-agent-form";
import { generateTextAgentReply } from "@/lib/text-agent-generate";
import { normalizeChatMessages } from "@/lib/text-chat-utils";
import {
  persistAssistantReplyOnly,
  persistUserMessageOnly
} from "@/lib/text-conversation-persist";
import {
  detectAssistantHandoffOffer,
  detectUserHandoffIntent,
  escalateConversationToHuman,
  shouldAutoReturnToAi,
  HANDOFF_VISITOR_REPLY
} from "@/lib/text-handoff";
import {
  allConversationMessagesForGemini,
  buildWhatsAppContactLabel,
  findWhatsAppConversation
} from "@/lib/whatsapp/conversation-thread";
import { mergeWhatsAppMetadata } from "@/lib/whatsapp/conversation-meta";
import { notifyPushForOrg } from "@/lib/push/send";
import { syncCrmContactFromWhatsAppInbound } from "@/lib/crm-contact-sync";
import { enrichCrmContactFromWhatsAppConversation } from "@/lib/crm-contact-enrich";
import { enrichCrmLeadForConversationId } from "@/lib/crm-lead-enrich";
import {
  canSendWhatsAppSessionMessage,
  detectWhatsAppOptOut,
  readWhatsAppMeta,
  WHATSAPP_OPT_OUT_CONFIRMATION
} from "@/lib/whatsapp/compliance";
import { buildWhatsAppInboundContent } from "@/lib/whatsapp/media-understanding";
import { sendWhatsAppTextMessage, sendWhatsAppTypingIndicator } from "@/lib/whatsapp/send-transport";
import {
  checkBillingForOrg,
  readGeminiUsage,
  recordUsageSafe,
  resolveOrgIdForUser
} from "@/lib/billing/meter";
import { getActiveCalendarConnection } from "@/lib/google-calendar/connections-db";
import { getOrgBusinessHours } from "@/lib/scheduling/business-hours-db";
import { resolveTextAgentForChannel } from "@/lib/text-agent-resolve";
import type { TwilioWhatsAppMediaItem } from "@/lib/whatsapp/twilio-media";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import { WHATSAPP_CONVERSATION_CHANNEL, toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import type { TextChatMessage } from "@/types/text-agent-conversation";

export interface TwilioWhatsAppInbound {
  messageSid: string;
  fromE164: string;
  toE164: string;
  body: string;
  profileName: string | null;
  media: TwilioWhatsAppMediaItem[];
}

async function resolveChannelOrgId(
  db: SupabaseClient,
  channel: WhatsAppChannelRecord
): Promise<string | null> {
  if (channel.organization_id) return channel.organization_id;
  return resolveOrgIdForUser(db, channel.user_id);
}

async function syncAndEnrichCrmFromInbound(
  db: SupabaseClient,
  channel: WhatsAppChannelRecord,
  conversationId: string,
  inbound: TwilioWhatsAppInbound,
  lastInboundAt: string,
  optedOut: boolean
): Promise<string | null> {
  try {
    const { contactId, error } = await syncCrmContactFromWhatsAppInbound(db, {
      userId: channel.user_id,
      fromE164: inbound.fromE164,
      profileName: inbound.profileName,
      conversationId,
      lastInboundAt,
      optedOut
    });
    if (error) console.error("[whatsapp/inbound] crm sync:", error);
    if (!contactId) return null;

    console.info(`[whatsapp/inbound] crm linked conversation ${conversationId} → contact ${contactId}`);

    void enrichCrmContactFromWhatsAppConversation(
      db,
      channel.user_id,
      contactId,
      conversationId
    ).catch(err => console.error("[whatsapp/inbound] crm enrich:", err));

    void enrichCrmLeadForConversationId(
      db,
      channel.user_id,
      conversationId
    ).catch(err => console.error("[whatsapp/inbound] crm lead enrich:", err));

    return contactId;
  } catch (err) {
    console.error("[whatsapp/inbound] crm sync:", err);
    return null;
  }
}

async function updateWhatsAppConversationMetadata(
  db: SupabaseClient,
  conversationId: string,
  userId: string,
  existingMeta: Record<string, unknown> | undefined,
  patch: Parameters<typeof mergeWhatsAppMetadata>[1]
): Promise<void> {
  await db
    .from("text_agent_conversations")
    .update({
      metadata: mergeWhatsAppMetadata(existingMeta, patch),
      updated_at: new Date().toISOString()
    })
    .eq("id", conversationId)
    .eq("user_id", userId);
}

async function sendWhatsAppIfAllowed(
  db: SupabaseClient,
  channel: WhatsAppChannelRecord,
  toE164: string,
  body: string,
  lastInboundAt: string,
  optedOut: boolean
): Promise<{ ok: boolean; error?: string }> {
  const gate = canSendWhatsAppSessionMessage({ lastInboundAt, optedOut });
  if (!gate.allowed) {
    return { ok: false, error: gate.reason };
  }

  try {
    await sendWhatsAppTextMessage({ db, channel, toE164, body });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al enviar WhatsApp";
    return { ok: false, error: msg };
  }
}

export async function processTwilioWhatsAppInbound(
  db: SupabaseClient,
  channel: WhatsAppChannelRecord,
  inbound: TwilioWhatsAppInbound
): Promise<{ ok: boolean; error?: string }> {
  if (channel.status !== "active") {
    return { ok: false, error: "Canal WhatsApp no activo" };
  }

  if (!channel.text_agent_id) {
    return { ok: false, error: "Canal sin agente de texto asignado" };
  }

  const apiKey = getOriApiKey();
  if (!apiKey) {
    return { ok: false, error: "ORI_GOOGLE_AI_KEY no configurada" };
  }

  const inboundContent = await buildWhatsAppInboundContent(
    apiKey,
    inbound.body,
    inbound.media,
    { db, userId: channel.user_id, messageSid: inbound.messageSid }
  );

  if (!inboundContent.userText.trim()) {
    return { ok: false, error: "Mensaje vacío o media no procesable" };
  }

  const nowIso = new Date().toISOString();
  const userDisplay = inboundContent.userVisible;
  const userForAi = inboundContent.userText;
  const userInternalContent =
    userForAi.trim() !== userDisplay.trim() ? userForAi : undefined;
  const userMediaType: TextChatMessage["media_type"] =
    inboundContent.primaryMediaType ?? (inbound.media.length ? "document" : "text");
  const userMediaLabel = inboundContent.mediaLabel;
  const orgId = await resolveChannelOrgId(db, channel);

  const { agent, error: agentErr } = await resolveTextAgentForChannel(db, channel);

  if (agentErr || !agent) {
    return { ok: false, error: agentErr ?? "Agente de texto no encontrado" };
  }

  const model = String(agent.llm_model || "gemini-2.5-flash");
  const contactLabel = buildWhatsAppContactLabel(inbound.profileName, inbound.fromE164);
  const existing = await findWhatsAppConversation(
    db,
    channel.user_id,
    channel.id,
    inbound.fromE164
  );

  const priorMeta = readWhatsAppMeta(existing?.metadata ?? {}, existing?.messages ?? []);
  const isOptOutRequest = detectWhatsAppOptOut(userForAi);
  const reEngaged = priorMeta.optedOut && !isOptOutRequest;
  const optedOutAfter = isOptOutRequest ? true : reEngaged ? false : priorMeta.optedOut;

  const metaPatch = {
    whatsapp_channel_id: channel.id,
    whatsapp_contact_e164: inbound.fromE164,
    last_twilio_message_sid: inbound.messageSid,
    whatsapp_last_inbound_at: nowIso,
    whatsapp_opted_out: optedOutAfter,
    whatsapp_opted_out_at: isOptOutRequest ? nowIso : reEngaged ? null : priorMeta.optedOut ? (existing?.metadata?.whatsapp_opted_out_at as string | null) ?? null : null
  };

  const persistOpts = {
    userMediaType: inbound.media.length ? userMediaType : undefined,
    userMediaLabel,
    userMediaStoragePath: inboundContent.mediaStoragePath,
    userMediaMime: inboundContent.mediaMime,
    userInternalContent
  };

  // —— Baja (STOP / CANCELAR) ——
  if (isOptOutRequest) {
    const persisted = await persistUserMessageOnly({
      db,
      userId: channel.user_id,
      agentId: String(agent.id),
      agentName: String(agent.name),
      conversationId: existing?.id ?? null,
      userMessage: userDisplay,
      llmModel: model,
      channel: WHATSAPP_CONVERSATION_CHANNEL,
      contactLabel: existing ? undefined : contactLabel,
      bumpUnread: true,
      ...persistOpts
    });

    if (persisted.error) return { ok: false, error: persisted.error };

    await updateWhatsAppConversationMetadata(
      db,
      persisted.conversationId,
      channel.user_id,
      existing?.metadata,
      metaPatch
    );

    await syncAndEnrichCrmFromInbound(db, channel, persisted.conversationId, inbound, nowIso, optedOutAfter);

    await sendWhatsAppIfAllowed(
      db,
      channel,
      inbound.fromE164,
      WHATSAPP_OPT_OUT_CONFIRMATION,
      nowIso,
      false
    );

    if (orgId) {
      await recordUsageSafe({
        db,
        organizationId: orgId,
        userId: channel.user_id,
        eventType: "whatsapp_manual",
        channel: WHATSAPP_CONVERSATION_CHANNEL,
        provider: "twilio",
        twilioMessages: 2, // entrante + confirmación de baja
        referenceType: "text_agent_conversation",
        referenceId: persisted.conversationId,
        idempotencyKey: `wa_optout_${inbound.messageSid}`
      });
    }

    return { ok: true };
  }

  // —— Modo humano —— (si nadie del equipo respondió a tiempo, se devuelve sola a la IA más abajo)
  if (existing?.handoff_mode === "human" && !shouldAutoReturnToAi(existing.messages ?? [])) {
    const persisted = await persistUserMessageOnly({
      db,
      userId: channel.user_id,
      agentId: String(agent.id),
      agentName: String(agent.name),
      conversationId: existing.id,
      userMessage: userDisplay,
      llmModel: model,
      channel: WHATSAPP_CONVERSATION_CHANNEL,
      bumpUnread: true,
      ...persistOpts
    });

    if (persisted.error) return { ok: false, error: persisted.error };

    await updateWhatsAppConversationMetadata(
      db,
      persisted.conversationId,
      channel.user_id,
      existing.metadata,
      metaPatch
    );

    await syncAndEnrichCrmFromInbound(db, channel, persisted.conversationId, inbound, nowIso, optedOutAfter);

    if (orgId) {
      await recordUsageSafe({
        db,
        organizationId: orgId,
        userId: channel.user_id,
        eventType: "whatsapp_manual",
        channel: WHATSAPP_CONVERSATION_CHANNEL,
        provider: "twilio",
        twilioMessages: 1,
        referenceType: "text_agent_conversation",
        referenceId: persisted.conversationId,
        idempotencyKey: `wa_in_${inbound.messageSid}`
      });

      // Mensaje nuevo en cola humana — avisa al equipo (no bloquea la respuesta al webhook).
      void notifyPushForOrg(orgId, {
        title: contactLabel || "Nuevo mensaje",
        body: userDisplay.length > 120 ? `${userDisplay.slice(0, 120)}…` : userDisplay,
        url: `/m/chats/${persisted.conversationId}`,
        tag: `msg-${persisted.conversationId}`
      });
    }

    return { ok: true };
  }

  // —— Respuesta IA (usuario primero, asistente después) ——
  if (orgId) {
    const billing = await checkBillingForOrg(db, orgId);
    if (!billing.allowed) {
      // Sin saldo / suspendida: registramos el entrante pero no gastamos IA ni enviamos.
      const blockedPersist = await persistUserMessageOnly({
        db,
        userId: channel.user_id,
        agentId: String(agent.id),
        agentName: String(agent.name),
        conversationId: existing?.id ?? null,
        userMessage: userDisplay,
        llmModel: model,
        channel: WHATSAPP_CONVERSATION_CHANNEL,
        contactLabel: existing ? undefined : contactLabel,
        bumpUnread: true,
        handoffMode: "human",
        statusLabel: "Sin créditos",
        ...persistOpts
      });
      if (!blockedPersist.error) {
        await updateWhatsAppConversationMetadata(
          db,
          blockedPersist.conversationId,
          channel.user_id,
          existing?.metadata,
          metaPatch
        );
        await syncAndEnrichCrmFromInbound(db, channel, blockedPersist.conversationId, inbound, nowIso, optedOutAfter);
      }
      return { ok: true };
    }
  }

  // —— Cliente pide asesor humano: cola sin asignar + aviso al equipo ——
  if (detectUserHandoffIntent(userDisplay)) {
    const userPersist = await persistUserMessageOnly({
      db,
      userId: channel.user_id,
      agentId: String(agent.id),
      agentName: String(agent.name),
      conversationId: existing?.id ?? null,
      userMessage: userDisplay,
      llmModel: model,
      channel: WHATSAPP_CONVERSATION_CHANNEL,
      contactLabel: existing ? undefined : contactLabel,
      bumpUnread: true,
      handoffMode: "human",
      statusLabel: "Esperando asesor",
      ...persistOpts
    });

    if (userPersist.error) return { ok: false, error: userPersist.error };

    await updateWhatsAppConversationMetadata(
      db,
      userPersist.conversationId,
      channel.user_id,
      existing?.metadata,
      metaPatch
    );

    await persistAssistantReplyOnly({
      db,
      userId: channel.user_id,
      conversationId: userPersist.conversationId,
      assistantReply: HANDOFF_VISITOR_REPLY,
      llmModel: model
    });

    await escalateConversationToHuman({
      db,
      userId: channel.user_id,
      conversationId: userPersist.conversationId,
      organizationId: orgId,
      reason: "user_request",
      channel: WHATSAPP_CONVERSATION_CHANNEL,
      agentName: String(agent.name),
      contactLabel: existing?.contact_label ? String(existing.contact_label) : contactLabel,
      visitorMessage: userDisplay,
      notifyRules: agent.notify_rules,
      outboundWhatsAppChannel: channel
    });

    await syncAndEnrichCrmFromInbound(db, channel, userPersist.conversationId, inbound, nowIso, optedOutAfter);

    const sendResult = await sendWhatsAppIfAllowed(
      db,
      channel,
      inbound.fromE164,
      HANDOFF_VISITOR_REPLY,
      nowIso,
      optedOutAfter
    );

    if (!sendResult.ok) {
      console.error("[whatsapp/inbound] handoff send:", sendResult.error);
    }

    if (orgId) {
      await recordUsageSafe({
        db,
        organizationId: orgId,
        userId: channel.user_id,
        eventType: "whatsapp_manual",
        channel: WHATSAPP_CONVERSATION_CHANNEL,
        provider: "twilio",
        twilioMessages: sendResult.ok ? 2 : 1,
        referenceType: "text_agent_conversation",
        referenceId: userPersist.conversationId,
        idempotencyKey: `wa_handoff_${inbound.messageSid}`
      });
    }

    return { ok: true };
  }

  let companyContextText = "";
  if (agent.company_context_id) {
    const { data: ctx } = await db
      .from("company_contexts")
      .select("content")
      .eq("id", agent.company_context_id)
      .eq("user_id", channel.user_id)
      .maybeSingle();
    companyContextText = String(ctx?.content ?? "");
  }

  const userPersist = await persistUserMessageOnly({
    db,
    userId: channel.user_id,
    agentId: String(agent.id),
    agentName: String(agent.name),
    conversationId: existing?.id ?? null,
    userMessage: userDisplay,
    llmModel: model,
    channel: WHATSAPP_CONVERSATION_CHANNEL,
    contactLabel: existing ? undefined : contactLabel,
    bumpUnread: true,
    handoffMode: "ai",
    statusLabel: "Chat activo",
    ...persistOpts
  });

  if (userPersist.error) return { ok: false, error: userPersist.error };

  // Best-effort: los "puntos de escribiendo" nativos de WhatsApp mientras el agente genera la respuesta.
  // Se espera a que Twilio confirme el envío (no fire-and-forget) para que quede garantizado
  // ANTES de la respuesta real. Twilio lo expira solo a los 25s — si todo el trabajo de abajo
  // (CRM, tools, Gemini) tarda más que eso, se refresca cada 12s para que nunca desaparezca
  // antes de que la respuesta esté lista.
  const typingStartedAt = Date.now();
  await sendWhatsAppTypingIndicator({ channel, messageId: inbound.messageSid, db }).catch(err =>
    console.warn("[whatsapp] typing indicator:", err instanceof Error ? err.message : err)
  );
  const typingRefreshInterval = setInterval(() => {
    void sendWhatsAppTypingIndicator({ channel, messageId: inbound.messageSid, db }).catch(err =>
      console.warn("[whatsapp] typing indicator refresh:", err instanceof Error ? err.message : err)
    );
  }, 12_000);

  let reply: string;
  let geminiUsage: ReturnType<typeof readGeminiUsage> | null = null;
  // El guardián del catálogo tuvo que eliminar un dato que el agente afirmó
  // sin respaldo: el cliente se queda sin respuesta y necesita un asesor.
  let catalogNeedsHuman = false;

  try {
    await updateWhatsAppConversationMetadata(
      db,
      userPersist.conversationId,
      channel.user_id,
      existing?.metadata,
      metaPatch
    );

    await syncAndEnrichCrmFromInbound(db, channel, userPersist.conversationId, inbound, nowIso, optedOutAfter);

  const refreshed = await findWhatsAppConversation(
    db,
    channel.user_id,
    channel.id,
    inbound.fromE164
  );

  const geminiContents = refreshed
    ? allConversationMessagesForGemini(refreshed)
    : [{ role: "user" as const, content: userForAi }];

  let dataTableContext = { text: "", rows: [], columns: [] } as Awaited<ReturnType<typeof buildDataTableContext>>;
  if (agent.data_table_id) {
    dataTableContext = await buildDataTableContext(
      db,
      String(agent.data_table_id),
      userForAi,
      orgId,
      {
        conversationText: recentAssistantTextForCatalog(geminiContents),
        previousUserText: previousUserTextForCatalog(geminiContents)
      }
    );
  }
  const promptWithCatalog = mergeDataTableContext(
    String(agent.prompt),
    dataTableContext.text || null,
    { tableLinked: Boolean(agent.data_table_id) }
  );
  const mergedPrompt = mergeCompanyContext(promptWithCatalog, companyContextText);
  const temporal = buildColombiaTemporalContext();
  const systemInstruction = `${temporal.promptBlock}\n\n${mergedPrompt}`;
  // Solo las instrucciones, SIN la tabla del catálogo: es lo que el guardián
  // toma como "importes y enlaces que el negocio autoriza". Si se le pasara el
  // prompt completo, la propia tabla incrustada daría por bueno cualquier
  // precio del catálogo y la validación por producto dejaría de servir.
  const catalogGuardPromptText = `${String(agent.prompt)}\n\n${companyContextText}`;

  try {
    const calendarConnection = orgId ? await getActiveCalendarConnection(db, orgId) : null;
    const businessHours = orgId ? await getOrgBusinessHours(db, orgId) : undefined;
    const generated = await generateTextAgentReply({
      model,
      systemInstruction,
      messages: geminiContents.map(m => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content
      })),
      temperature: geminiTextTemperature(Number(agent.temperature) || 0.7),
      maxOutputTokens: Number(agent.max_output_tokens) || 1024,
      notifyRules: agent.notify_rules,
      schedulingRules: agent.scheduling_rules,
      businessHours,
      calendarConnection,
      toolContext: {
        db,
        organizationId: orgId,
        conversationId: userPersist.conversationId,
        channel: WHATSAPP_CONVERSATION_CHANNEL,
        agentId: String(agent.id),
        agentType: "text",
        agentName: String(agent.name),
        contactLabel: existing?.contact_label ? String(existing.contact_label) : contactLabel,
        outboundWhatsAppChannel: channel
      }
    });
    const withRealCards = resolveProductCards(
      generated.text,
      dataTableContext.rows,
      dataTableContext.columns
    );
    const guarded = enforceCatalogFacts(
      withRealCards,
      dataTableContext.rows,
      dataTableContext.columns,
      catalogGuardPromptText
    );
    if (guarded.violations.length) {
      console.warn(
        "[whatsapp/inbound] datos corregidos contra el catálogo:",
        JSON.stringify({ agentId: agent.id, violations: guarded.violations })
      );
    }
    catalogNeedsHuman = guarded.needsHuman;
    reply = guarded.text;
    geminiUsage = generated.usage;
    if (generated.toolResults.length) {
      console.info(
        "[whatsapp/inbound] notify_team:",
        JSON.stringify(generated.toolResults)
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error IA";
    console.error("[whatsapp/inbound] generación de respuesta falló tras reintento, escalando a humano:", msg);

    // Gemini falló dos veces seguidas (ver withOneRetryOnOverload): antes esto
    // dejaba al cliente sin ninguna respuesta y sin rastro visible del error.
    const fallbackReply = "En un momento un asesor te contactará.";
    await persistAssistantReplyOnly({
      db,
      userId: channel.user_id,
      conversationId: userPersist.conversationId,
      assistantReply: fallbackReply,
      llmModel: model
    });

    await escalateConversationToHuman({
      db,
      userId: channel.user_id,
      conversationId: userPersist.conversationId,
      organizationId: orgId,
      reason: "ai_escalation",
      channel: WHATSAPP_CONVERSATION_CHANNEL,
      agentName: String(agent.name),
      contactLabel: existing?.contact_label ? String(existing.contact_label) : contactLabel,
      visitorMessage: userDisplay,
      notifyRules: agent.notify_rules,
      outboundWhatsAppChannel: channel
    });

    const sendResult = await sendWhatsAppIfAllowed(
      db,
      channel,
      inbound.fromE164,
      fallbackReply,
      nowIso,
      optedOutAfter
    );
    if (!sendResult.ok) {
      console.error("[whatsapp/inbound] fallback send:", sendResult.error);
    }

    return { ok: true };
  }
  } finally {
    clearInterval(typingRefreshInterval);
  }

  const assistantPersist = await persistAssistantReplyOnly({
    db,
    userId: channel.user_id,
    conversationId: userPersist.conversationId,
    assistantReply: reply,
    llmModel: model
  });

  if (!assistantPersist.ok) {
    return { ok: false, error: assistantPersist.error };
  }

  if (catalogNeedsHuman || detectAssistantHandoffOffer(reply)) {
    await escalateConversationToHuman({
      db,
      userId: channel.user_id,
      conversationId: userPersist.conversationId,
      organizationId: orgId,
      reason: "ai_escalation",
      channel: WHATSAPP_CONVERSATION_CHANNEL,
      agentName: String(agent.name),
      contactLabel: existing?.contact_label ? String(existing.contact_label) : contactLabel,
      visitorMessage: userDisplay,
      notifyRules: agent.notify_rules,
      outboundWhatsAppChannel: channel
    });
  }

  void enrichCrmLeadForConversationId(db, channel.user_id, userPersist.conversationId).catch(err =>
    console.error("[whatsapp/inbound] crm lead enrich (post-ai):", err)
  );

  // Le da tiempo al indicador de "escribiendo…" de mostrarse de verdad antes de reemplazarlo
  // con la respuesta — sin esto, una respuesta muy rápida de Gemini lo deja invisible.
  const elapsedSinceTyping = Date.now() - typingStartedAt;
  const MIN_TYPING_VISIBLE_MS = 1800;
  if (elapsedSinceTyping < MIN_TYPING_VISIBLE_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_TYPING_VISIBLE_MS - elapsedSinceTyping));
  }

  const sendResult = await sendWhatsAppIfAllowed(
    db,
    channel,
    inbound.fromE164,
    reply,
    nowIso,
    optedOutAfter
  );

  if (!sendResult.ok) {
    console.error("[whatsapp/inbound] send:", sendResult.error);
    return { ok: false, error: sendResult.error };
  }

  if (orgId) {
    await recordUsageSafe({
      db,
      organizationId: orgId,
      userId: channel.user_id,
      eventType: "whatsapp_ai",
      channel: WHATSAPP_CONVERSATION_CHANNEL,
      provider: "google",
      model,
      gemini: geminiUsage,
      twilioMessages: 2, // entrante + saliente
      referenceType: "text_agent_conversation",
      referenceId: userPersist.conversationId,
      idempotencyKey: `wa_ai_${inbound.messageSid}`
    });
  }

  return { ok: true };
}

export async function sendWhatsAppOutboundForConversation(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
  body: string
): Promise<{ ok: boolean; error?: string; code?: string }> {
  const { data: conv, error: convErr } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (convErr || !conv) {
    return { ok: false, error: "Conversación no encontrada" };
  }

  if (String(conv.channel) !== WHATSAPP_CONVERSATION_CHANNEL) {
    return { ok: true };
  }

  const meta = (conv.metadata ?? {}) as Record<string, unknown>;
  const channelId = meta.whatsapp_channel_id ? String(meta.whatsapp_channel_id) : "";
  const contactE164 = meta.whatsapp_contact_e164 ? String(meta.whatsapp_contact_e164) : "";
  const waMeta = readWhatsAppMeta(meta, normalizeChatMessages(conv.messages));

  const gate = canSendWhatsAppSessionMessage({
    lastInboundAt: waMeta.lastInboundAt,
    optedOut: waMeta.optedOut
  });
  if (!gate.allowed) {
    return { ok: false, error: gate.reason, code: gate.code };
  }

  if (!channelId || !contactE164) {
    return { ok: false, error: "Conversación WhatsApp sin metadatos de contacto" };
  }

  const { data: channelRow, error: chErr } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("id", channelId)
    .eq("user_id", userId)
    .maybeSingle();

  if (chErr || !channelRow) {
    return { ok: false, error: "Canal WhatsApp no encontrado" };
  }

  const outboundOrgId = channelRow.organization_id
    ? String(channelRow.organization_id)
    : await resolveOrgIdForUser(db, userId);

  if (outboundOrgId) {
    const billing = await checkBillingForOrg(db, outboundOrgId);
    if (!billing.allowed) {
      return {
        ok: false,
        code: billing.reason,
        error:
          billing.reason === "no_credits"
            ? "Sin créditos este mes. Recarga para enviar WhatsApp."
            : "Cuenta suspendida. Regulariza el pago para enviar WhatsApp."
      };
    }
  }

  try {
    const channel = toWhatsAppChannelRecord(channelRow as Record<string, unknown>);
    await sendWhatsAppTextMessage({
      db,
      channel,
      channelRaw: channelRow as Record<string, unknown>,
      toE164: contactE164,
      body
    });

    if (outboundOrgId) {
      await recordUsageSafe({
        db,
        organizationId: outboundOrgId,
        userId,
        eventType: "whatsapp_manual",
        channel: WHATSAPP_CONVERSATION_CHANNEL,
        provider: "twilio",
        twilioMessages: 1,
        referenceType: "text_agent_conversation",
        referenceId: conversationId
      });
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al enviar WhatsApp";
    return { ok: false, error: msg };
  }
}
