import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { getOriApiKey, getOriModel } from "@/lib/google-ai";
import { getAnthropicApiKey, readClaudeUsage, createClaudeMessage, toAnthropicTools } from "@/lib/text-agent-generate-claude";
import { resolveTextLlm } from "@/lib/text-agent-options";
import { buildOriSystemInstruction } from "@/lib/merge-ori-context";
import { buildColombiaTemporalContext } from "@/lib/colombia-calendar";
import { getTimeRules } from "@/lib/call-engine/platform-config";
import {
  formatPlatformHelpContext,
  messageLooksLikePlatformQuestion,
  retrievePlatformHelp,
} from "@/lib/platform-help/retrieve";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";
import {
  checkBillingForUser,
  readGeminiUsage,
  recordUsageSafe
} from "@/lib/billing/meter";
import { providerForLlmModel } from "@/lib/billing/pricing";
import { getOriInventoryAccess } from "@/lib/erp/ori-access-db";
import { executeOriTool } from "@/lib/agent-tools/ori-tools";
import { ORI_TOOLS } from "@/lib/agent-tools/inventory-lookup-tool";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const apiKey = getOriApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Falta ORI_GOOGLE_AI_KEY en .env.local. Crea una API key aparte en Google AI Studio para Ori y reinicia el servidor."
      },
      { status: 500 }
    );
  }

  const body = await req.json();
  const messages = (body.messages ?? []) as ChatMessage[];
  const companyContextId = body.company_context_id as string | undefined;
  // Si el usuario no elige modelo, sigue el default de siempre (Gemini vía ORI_GEMINI_MODEL).
  const model = body.model ? resolveTextLlm(String(body.model)) : getOriModel();
  const lastUser = [...messages].reverse().find(m => m.role === "user");

  if (!lastUser?.content?.trim()) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  }

  const billingDb = adminClient();
  const billing = await checkBillingForUser(billingDb, userId);
  if (!billing.allowed) {
    return NextResponse.json(
      {
        error:
          billing.reason === "no_credits"
            ? "Te quedaste sin créditos este mes. Recarga o espera tu próxima fecha de facturación."
            : "Tu cuenta está suspendida. Regulariza el pago para reactivar ORI.",
        code: billing.reason
      },
      { status: 402 }
    );
  }

  let companyContextText = "";
  if (companyContextId) {
    const db = adminClient();
    const { data } = await db
      .from("company_contexts")
      .select("content")
      .eq("id", companyContextId)
      .eq("user_id", userId)
      .maybeSingle();
    companyContextText = data?.content ?? "";
  } else {
    const db = adminClient();
    const { data } = await db
      .from("company_contexts")
      .select("content")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();
    companyContextText = data?.content ?? "";
  }

  const platformArticles =
    messageLooksLikePlatformQuestion(lastUser.content)
      ? retrievePlatformHelp(lastUser.content)
      : [];
  const platformHelp = formatPlatformHelpContext(platformArticles);

  const timeRules = await getTimeRules(billingDb);
  const temporal = buildColombiaTemporalContext(new Date(), {
    extraEvents: timeRules.extra_events,
    extraNotes: timeRules.extra_notes,
  });

  // Tools internas de Ori (hoy solo consultar_inventario) — nunca las de
  // ALL_TEXT_AGENT_TOOLS, que alimentan al agente que habla con clientes
  // externos. Se filtran por organización: erp encendido + toggle propio de Ori
  // (ver src/lib/erp/ori-access-db.ts) — ninguna de las dos sola alcanza.
  const oriTools = billing.organizationId && (await getOriInventoryAccess(billingDb, billing.organizationId))
    ? ORI_TOOLS
    : [];
  const toolsEnabled = oriTools.length > 0;
  const toolsPromptBlock = oriTools.map(t => t.promptBlock).join("\n\n");

  const systemInstruction = [
    buildOriSystemInstruction(companyContextText, platformHelp, temporal.promptBlock),
    toolsPromptBlock
  ]
    .filter(block => block.trim().length > 0)
    .join("\n\n");

  const toolCtx = { db: billingDb, organizationId: billing.organizationId ?? "" };

  try {
    let reply: string;
    let usage: ReturnType<typeof readGeminiUsage>;

    if (model.startsWith("claude-")) {
      const client = new Anthropic({ apiKey: getAnthropicApiKey() });
      const anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({ role: m.role, content: m.content }));
      const tools = toolsEnabled ? toAnthropicTools(oriTools.map(t => t.declaration)) : undefined;

      let response = await createClaudeMessage(
        client,
        { model, system: systemInstruction, max_tokens: 2048, temperature: 0.7, messages: anthropicMessages, tools },
        {}
      );
      usage = readClaudeUsage(response);

      let rounds = 0;
      while (toolsEnabled && response.stop_reason === "tool_use" && rounds < 3) {
        rounds += 1;
        const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        anthropicMessages.push({ role: "assistant", content: response.content });

        const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
        for (const call of toolUseBlocks) {
          const result = await executeOriTool(oriTools, call.name, (call.input ?? {}) as Record<string, unknown>, toolCtx);
          toolResultBlocks.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
        }
        anthropicMessages.push({ role: "user", content: toolResultBlocks });

        response = await createClaudeMessage(
          client,
          { model, system: systemInstruction, max_tokens: 2048, temperature: 0.7, messages: anthropicMessages, tools },
          {}
        );
        usage = readClaudeUsage(response);
      }

      reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map(b => b.text)
        .join("\n")
        .trim();
    } else {
      const ai = new GoogleGenAI({ apiKey });
      const contents: Content[] = messages.map(m => ({
        role: m.role === "assistant" ? "model" as const : "user" as const,
        parts: [{ text: m.content }]
      }));
      const config = {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 2048,
        ...(toolsEnabled ? { tools: [{ functionDeclarations: oriTools.map(t => t.declaration) }] } : {})
      };

      let response = await ai.models.generateContent({ model, contents, config });
      usage = readGeminiUsage(response);

      let rounds = 0;
      while (toolsEnabled && response.functionCalls?.length && rounds < 3) {
        rounds += 1;
        const modelContent = response.candidates?.[0]?.content;
        if (modelContent) {
          contents.push(modelContent);
        } else {
          contents.push({
            role: "model",
            parts: response.functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args, id: fc.id } }))
          });
        }

        const functionResponseParts: Part[] = [];
        for (const call of response.functionCalls) {
          const name = call.name ?? "";
          const result = await executeOriTool(oriTools, name, (call.args ?? {}) as Record<string, unknown>, toolCtx);
          functionResponseParts.push({ functionResponse: { name, id: call.id, response: result } });
        }
        contents.push({ role: "user", parts: functionResponseParts });

        response = await ai.models.generateContent({ model, contents, config });
        usage = readGeminiUsage(response);
      }

      reply = response.text?.trim() ?? "";
    }

    if (!reply) {
      return NextResponse.json({ error: "Ori no generó respuesta" }, { status: 502 });
    }

    if (billing.organizationId) {
      await recordUsageSafe({
        db: billingDb,
        organizationId: billing.organizationId,
        userId,
        eventType: "ori",
        channel: "ori",
        provider: providerForLlmModel(model),
        model,
        gemini: usage
      });
    }

    return NextResponse.json({ reply, model });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al consultar Gemini";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
