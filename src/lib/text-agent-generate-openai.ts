import OpenAI from "openai";
import type { FunctionDeclaration } from "@google/genai";
import {
  resolveEnabledTools,
  buildToolsPromptBlock,
  buildFunctionDeclarations,
  executeAgentTool,
  type AgentToolResult
} from "@/lib/agent-tools/registry";
import {
  normalizeNotifyTeamRules,
  type NotifyTeamRules
} from "@/lib/text-notify-rules";
import {
  normalizeSchedulingRules,
  normalizeOrgBusinessHours,
  type SchedulingRules,
  type OrgBusinessHours
} from "@/lib/scheduling/rules";
import { ALL_TEXT_AGENT_TOOLS } from "@/lib/agent-tools/all-text-tools";
import type {
  GenerateTextAgentReplyInput,
  GenerateTextAgentReplyResult
} from "@/lib/text-agent-generate";
import type { GeminiUsage } from "@/lib/billing/meter";
import { withLlmTimeout } from "@/lib/gemini-timeout";
import { convertGeminiSchema } from "@/lib/text-agent-generate-claude";

export function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Falta OPENAI_API_KEY");
  return key;
}

/** Mismo conversor de schema que usa Claude (registry.ts define las tools en formato Gemini). */
function toOpenAiTools(declarations: FunctionDeclaration[]): OpenAI.Chat.ChatCompletionTool[] {
  return declarations.map(decl => ({
    type: "function",
    function: {
      name: decl.name ?? "",
      description: decl.description ?? "",
      parameters: convertGeminiSchema(decl.parameters)
    }
  }));
}

/** Lee el uso de tokens de una respuesta del Chat Completions API de OpenAI. */
export function readOpenAiUsage(response: OpenAI.Chat.ChatCompletion): GeminiUsage {
  const input = response.usage?.prompt_tokens ?? 0;
  const output = response.usage?.completion_tokens ?? 0;
  return { promptTokens: input, completionTokens: output, totalTokens: input + output };
}

function addUsage(a: GeminiUsage, b: GeminiUsage): GeminiUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens
  };
}

function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Genera respuesta del agente de texto con OpenAI (GPT-4o mini) — misma interfaz que
 * `generateTextAgentReply` (Gemini) y `generateClaudeAgentReply` (Claude), para que
 * quien llama no necesite saber qué motor respondió realmente.
 */
export async function generateOpenAiAgentReply(
  input: GenerateTextAgentReplyInput
): Promise<GenerateTextAgentReplyResult> {
  const client = new OpenAI({ apiKey: getOpenAiApiKey() });

  const rulesCtx = {
    notifyRules: normalizeNotifyTeamRules(input.notifyRules) as NotifyTeamRules,
    schedulingRules: normalizeSchedulingRules(input.schedulingRules) as SchedulingRules,
    businessHours: normalizeOrgBusinessHours(input.businessHours) as OrgBusinessHours,
    calendarConnection: input.calendarConnection ?? null
  };

  const enabledTools = resolveEnabledTools(ALL_TEXT_AGENT_TOOLS, rulesCtx);
  const toolsEnabled = enabledTools.length > 0;
  const toolsPromptBlock = buildToolsPromptBlock(enabledTools, rulesCtx);
  const tools = toolsEnabled ? toOpenAiTools(buildFunctionDeclarations(enabledTools)) : undefined;

  const schedulingUnavailableBlock =
    rulesCtx.schedulingRules.enabled && !rulesCtx.calendarConnection
      ? "IMPORTANTE — Agendamiento no disponible ahora mismo: el calendario está desconectado por un problema técnico. Si el usuario pide agendar una cita, discúlpate, explica que hay un inconveniente técnico y ofrece que un asesor humano lo contacte para coordinarla manualmente. NUNCA digas que la cita quedó agendada o confirmada: no tienes forma de agendarla en este momento."
      : "";

  const system = [input.systemInstruction, toolsPromptBlock, schedulingUnavailableBlock]
    .filter(block => block.trim().length > 0)
    .join("\n\n");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...input.messages.map((m): OpenAI.Chat.ChatCompletionMessageParam => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content
    }))
  ];

  const toolResults: AgentToolResult[] = [];
  let usage: GeminiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  let response = await withLlmTimeout(
    abortSignal =>
      client.chat.completions.create(
        { model: input.model, messages, max_completion_tokens: input.maxOutputTokens, temperature: input.temperature, tools },
        { signal: abortSignal }
      ),
    undefined,
    "OpenAI"
  );
  usage = addUsage(usage, readOpenAiUsage(response));
  let choice = response.choices[0];

  let rounds = 0;
  while (
    toolsEnabled &&
    choice?.finish_reason === "tool_calls" &&
    choice.message.tool_calls?.length &&
    rounds < 3
  ) {
    rounds += 1;
    messages.push(choice.message);

    for (const call of choice.message.tool_calls) {
      if (call.type !== "function") continue;
      const args = safeJsonParse(call.function.arguments);
      const result = await executeAgentTool(enabledTools, call.function.name, args, {
        ...input.toolContext,
        ...rulesCtx
      });
      toolResults.push(result);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }

    response = await withLlmTimeout(
      abortSignal =>
        client.chat.completions.create(
          { model: input.model, messages, max_completion_tokens: input.maxOutputTokens, temperature: input.temperature, tools },
          { signal: abortSignal }
        ),
      undefined,
      "OpenAI"
    );
    usage = addUsage(usage, readOpenAiUsage(response));
    choice = response.choices[0];
  }

  const text = choice?.message.content?.trim() ?? "";
  if (!text) throw new Error("IA sin respuesta");

  return { text, usage, toolResults };
}
