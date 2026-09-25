import type { SupabaseClient } from "@supabase/supabase-js";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";
import { mergeCompanyContext } from "@/lib/merge-company-context";
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
  buildAgentThreadContext,
  buildRollingSummary,
  persistThreadContextSummary,
  readThreadContextSummary
} from "@/lib/ai-thread-context";
import { getActiveCalendarConnection } from "@/lib/google-calendar/connections-db";
import { getWooCommerceConnection } from "@/lib/woocommerce/connections-db";
import { getOrgBusinessHours } from "@/lib/scheduling/business-hours-db";
import { normalizeQuotingRules } from "@/lib/insurers/quoting-rules";
import { getAllRamoCampoDefinitionsParaCotizar } from "@/lib/insurers/quote-guidance";
import { getRamosOfrecidosLabels, mergeRamosOfrecidosContext } from "@/lib/insurers/ramos-ofrecidos-context";
import type { readGeminiUsage } from "@/lib/billing/meter";
import type { MetaMessagingChannelRecord } from "@/lib/meta-messaging/types";
import type { TextAgentConversationRecord } from "@/types/text-agent-conversation";

/**
 * Genera la respuesta del agente para un turno de Messenger / Instagram con el
 * mismo contexto que WhatsApp (empresa, catálogo, calendario, cotización,
 * WooCommerce, hilo con resumen rodante y guardián del catálogo). Lo propio de
 * WhatsApp (botones interactivos, teléfono del contacto) no se pasa: las tools
 * que lo necesitan caen solas a texto.
 */
export async function generateMetaAgentReply(input: {
  db: SupabaseClient;
  channel: MetaMessagingChannelRecord;
  agent: Record<string, unknown>;
  conversation: TextAgentConversationRecord | null;
  conversationId: string;
  userForAi: string;
  contactLabel: string;
}): Promise<{
  reply: string;
  engine: string;
  usage: ReturnType<typeof readGeminiUsage>;
  catalogNeedsHuman: boolean;
}> {
  const { db, channel, agent } = input;
  const orgId = channel.organization_id;
  const model = String(agent.llm_model || "gemini-2.5-flash");

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

  const threadMessages = input.conversation ? normalizeChatMessages(input.conversation.messages) : [];
  const priorSummary = input.conversation ? readThreadContextSummary(input.conversation.metadata) : null;
  let threadContext = buildAgentThreadContext(threadMessages, priorSummary);

  if (input.conversation && threadContext.summarizeUpto !== null) {
    const nextSummary = await buildRollingSummary(threadMessages, priorSummary, threadContext.summarizeUpto);
    if (nextSummary) {
      await persistThreadContextSummary(db, input.conversationId, channel.user_id, nextSummary);
      threadContext = buildAgentThreadContext(threadMessages, nextSummary);
    }
  }

  const contents = threadContext.messages.length
    ? threadContext.messages
    : [{ role: "user" as const, content: input.userForAi }];

  let dataTableContext = { text: "", rows: [], columns: [] } as Awaited<ReturnType<typeof buildDataTableContext>>;
  if (agent.data_table_id) {
    dataTableContext = await buildDataTableContext(db, String(agent.data_table_id), input.userForAi, orgId, {
      conversationText: recentAssistantTextForCatalog(contents),
      previousUserText: previousUserTextForCatalog(contents)
    });
  }

  const promptWithCatalog = mergeDataTableContext(String(agent.prompt), dataTableContext.text || null, {
    tableLinked: Boolean(agent.data_table_id)
  });
  const ramosOfrecidos = await getRamosOfrecidosLabels(db, orgId);
  const mergedPrompt = mergeRamosOfrecidosContext(mergeCompanyContext(promptWithCatalog, companyContextText), ramosOfrecidos);
  const systemInstruction = [buildColombiaTemporalContext().promptBlock, mergedPrompt, threadContext.contextBlock]
    .filter(Boolean)
    .join("\n\n");

  const calendarConnection = await getActiveCalendarConnection(db, orgId);
  const wooCommerceConnection = await getWooCommerceConnection(db, orgId);
  const businessHours = await getOrgBusinessHours(db, orgId);
  const ramoCampos = normalizeQuotingRules(agent.quoting_rules).enabled
    ? await getAllRamoCampoDefinitionsParaCotizar(db, orgId)
    : {};

  const generated = await generateTextAgentReply({
    model,
    systemInstruction,
    messages: contents.map(m => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content
    })),
    temperature: geminiTextTemperature(Number(agent.temperature) || 0.7),
    maxOutputTokens: Number(agent.max_output_tokens) || 1024,
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
      organizationId: orgId,
      conversationId: input.conversationId,
      channel: channel.platform,
      agentId: String(agent.id),
      agentType: "text",
      agentName: String(agent.name),
      contactLabel: input.contactLabel
    }
  });

  const withRealCards = resolveProductCards(generated.text, dataTableContext.rows, dataTableContext.columns);
  // Solo las instrucciones, sin la tabla: es lo que el guardián toma como
  // "importes y enlaces autorizados" (ver el mismo punto en WhatsApp).
  const guarded = enforceCatalogFacts(
    withRealCards,
    dataTableContext.rows,
    dataTableContext.columns,
    `${String(agent.prompt)}\n\n${companyContextText}`
  );
  if (guarded.violations.length) {
    console.warn(
      "[meta-messaging] datos corregidos contra el catálogo:",
      JSON.stringify({ agentId: agent.id, violations: guarded.violations })
    );
  }

  return {
    reply: guarded.text,
    engine: generated.engine ?? model,
    usage: generated.usage,
    catalogNeedsHuman: guarded.needsHuman
  };
}
