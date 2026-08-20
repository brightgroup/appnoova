import { NextRequest, NextResponse } from "next/server";
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
import { persistChatTurn } from "@/lib/text-conversation-persist";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";
import { checkBillingForUser, recordUsageSafe } from "@/lib/billing/meter";
import { providerForLlmModel } from "@/lib/billing/pricing";
import { resolveOrgActiveWhatsAppChannel } from "@/lib/text-notify-team";
import { getActiveCalendarConnection } from "@/lib/google-calendar/connections-db";
import { getOrgBusinessHours } from "@/lib/scheduling/business-hours-db";

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

  if (agent.human_only === true) {
    return NextResponse.json(
      {
        error:
          "Este agente solo atiende con humanos. Las pruebas de IA están desactivadas."
      },
      { status: 400 }
    );
  }

  const billing = await checkBillingForUser(db, userId);
  if (!billing.allowed) {
    return NextResponse.json(
      {
        error:
          billing.reason === "no_credits"
            ? "Te quedaste sin créditos este mes. Recarga o espera tu próxima fecha de facturación."
            : "Tu cuenta está suspendida. Regulariza el pago para continuar.",
        code: billing.reason
      },
      { status: 402 }
    );
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

  let dataTableContext = { text: "", rows: [], columns: [] } as Awaited<ReturnType<typeof buildDataTableContext>>;
  if (agent.data_table_id) {
    dataTableContext = await buildDataTableContext(
      db,
      String(agent.data_table_id),
      lastUser.content.trim(),
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
  const mergedPrompt = mergeCompanyContext(promptWithCatalog, companyContextText);
  const temporal = buildColombiaTemporalContext();
  const systemInstruction = `${temporal.promptBlock}\n\n${mergedPrompt}`;
  // Solo las instrucciones, SIN la tabla del catálogo: es lo que el guardián
  // toma como "importes y enlaces que el negocio autoriza". Si se le pasara el
  // prompt completo, la propia tabla incrustada daría por bueno cualquier
  // precio del catálogo y la validación por producto dejaría de servir.
  const catalogGuardPromptText = `${String(agent.prompt)}\n\n${companyContextText}`;
  const model = String(agent.llm_model || "gemini-2.5-flash");
  const temperature = geminiTextTemperature(Number(agent.temperature) || 0.7);
  const maxOutputTokens = Number(agent.max_output_tokens) || 1024;
  const orgId = billing.organizationId || String(agent.organization_id || "");
  const waChannel = orgId ? await resolveOrgActiveWhatsAppChannel(db, orgId) : null;
  const calendarConnection = orgId ? await getActiveCalendarConnection(db, orgId) : null;
  const businessHours = orgId ? await getOrgBusinessHours(db, orgId) : undefined;

  try {
    const generated = await generateTextAgentReply({
      model,
      systemInstruction,
      messages: messages.map(m => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content
      })),
      temperature,
      maxOutputTokens,
      notifyRules: agent.notify_rules,
      schedulingRules: agent.scheduling_rules,
      businessHours,
      calendarConnection,
      toolContext: {
        db,
        organizationId: orgId,
        conversationId: conversationId ?? null,
        channel: "web_test",
        agentId: String(agent.id),
        agentType: "text",
        agentName: String(agent.name),
        contactLabel: "Prueba web",
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
        "[text/agents/chat] datos corregidos contra el catálogo:",
        JSON.stringify({ agentId: agent.id, violations: guarded.violations })
      );
    }
    const reply = guarded.text;

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

    if (billing.organizationId) {
      // Motor real, no el elegido por el agente — pueden diferir tras un
      // failover (generateTextAgentReply). El precio al cliente no cambia.
      const actualEngine = generated.engine ?? model;
      await recordUsageSafe({
        db,
        organizationId: billing.organizationId,
        userId,
        eventType: "text_test",
        channel: "web_test",
        provider: providerForLlmModel(actualEngine),
        model: actualEngine,
        gemini: generated.usage,
        referenceType: "text_agent_conversation",
        referenceId: savedConversationId ?? undefined
      });
    }

    return NextResponse.json({
      reply,
      model,
      conversation_id: savedConversationId,
      notify_team: generated.toolResults
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al consultar el agente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
