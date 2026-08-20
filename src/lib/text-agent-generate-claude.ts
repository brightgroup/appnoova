import Anthropic from "@anthropic-ai/sdk";
import type { FunctionDeclaration, Schema } from "@google/genai";
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

export function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("Falta ANTHROPIC_API_KEY");
  return key;
}

function isTemperatureUnsupportedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /temperature.*deprecated for this model/i.test(msg);
}

/**
 * Wrapper de `client.messages.create` que reintenta sin `temperature` si el
 * modelo la rechaza. Encontrado en vivo el 2026-08-20 probando el nodo de
 * extracción con IA: `claude-sonnet-5` devuelve 400 ("temperature is
 * deprecated for this model") ante CUALQUIER valor de `temperature` — no es
 * intermitente, es el 100% de las llamadas. Sin este resguardo, cualquier
 * agente configurado en Sonnet 5 queda mudo. `claude-haiku-4-5` no tiene el
 * problema, así que el reintento solo dispara cuando realmente hace falta.
 */
export async function createClaudeMessage(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: { signal?: AbortSignal }
): Promise<Anthropic.Message> {
  try {
    return await client.messages.create(params, options);
  } catch (err) {
    if (!isTemperatureUnsupportedError(err) || params.temperature === undefined) throw err;
    const { temperature: _drop, ...rest } = params;
    return client.messages.create(rest, options);
  }
}

/**
 * Bloque de imagen/documento en base64 para el Messages API de Claude —
 * compartido entre `media-understanding.ts` (entendimiento conversacional) y
 * `automations/ai-extract-engine.ts` (extracción estructurada), para no
 * duplicar esta construcción en los dos lugares.
 */
export function buildAnthropicMediaBlock(
  base64: string,
  mimeType: string,
  kind: "image" | "document"
): Anthropic.ContentBlockParam {
  return kind === "image"
    ? { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg", data: base64 } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
}

/**
 * Los agentes de texto ya definen sus tools en formato Gemini (`FunctionDeclaration`,
 * con `Type.OBJECT`/`Type.STRING` en mayúsculas). Anthropic y OpenAI usan JSON Schema
 * estándar (`type: "object"` en minúscula) — este conversor recorre el schema de
 * Gemini y produce el JSON Schema que esperan tanto el Messages API de Claude
 * (`input_schema`) como el Chat Completions API de OpenAI (`parameters`). Se exporta
 * para que `text-agent-generate-openai.ts` no duplique esta lógica.
 */
export function convertGeminiSchema(schema: Schema | undefined): Record<string, unknown> {
  if (!schema) return { type: "object", properties: {} };
  const out: Record<string, unknown> = {};
  if (schema.type) out.type = String(schema.type).toLowerCase();
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, convertGeminiSchema(value as Schema)])
    );
  }
  if (schema.items) out.items = convertGeminiSchema(schema.items as Schema);
  if (schema.required) out.required = schema.required;
  return out;
}

function toAnthropicTools(declarations: FunctionDeclaration[]): Anthropic.Tool[] {
  return declarations.map(decl => ({
    name: decl.name ?? "",
    description: decl.description ?? "",
    input_schema: convertGeminiSchema(decl.parameters) as Anthropic.Tool.InputSchema
  }));
}

/** Lee el uso de tokens de una respuesta del Messages API de Anthropic. */
export function readClaudeUsage(response: Anthropic.Message): GeminiUsage {
  const input = response.usage?.input_tokens ?? 0;
  const output = response.usage?.output_tokens ?? 0;
  return { promptTokens: input, completionTokens: output, totalTokens: input + output };
}

function addUsage(a: GeminiUsage, b: GeminiUsage): GeminiUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens
  };
}

/**
 * Genera respuesta del agente de texto con Claude (Sonnet/Haiku) — misma
 * interfaz que `generateTextAgentReply` (Gemini), para que quien llama no
 * necesite saber qué proveedor está detrás del `model` guardado en la BD.
 */
export async function generateClaudeAgentReply(
  input: GenerateTextAgentReplyInput
): Promise<GenerateTextAgentReplyResult> {
  const client = new Anthropic({ apiKey: getAnthropicApiKey() });

  const rulesCtx = {
    notifyRules: normalizeNotifyTeamRules(input.notifyRules) as NotifyTeamRules,
    schedulingRules: normalizeSchedulingRules(input.schedulingRules) as SchedulingRules,
    businessHours: normalizeOrgBusinessHours(input.businessHours) as OrgBusinessHours,
    calendarConnection: input.calendarConnection ?? null
  };

  const enabledTools = resolveEnabledTools(ALL_TEXT_AGENT_TOOLS, rulesCtx);
  const toolsEnabled = enabledTools.length > 0;
  const toolsPromptBlock = buildToolsPromptBlock(enabledTools, rulesCtx);
  const tools = toolsEnabled ? toAnthropicTools(buildFunctionDeclarations(enabledTools)) : undefined;

  const schedulingUnavailableBlock =
    rulesCtx.schedulingRules.enabled && !rulesCtx.calendarConnection
      ? "IMPORTANTE — Agendamiento no disponible ahora mismo: el calendario está desconectado por un problema técnico. Si el usuario pide agendar una cita, discúlpate, explica que hay un inconveniente técnico y ofrece que un asesor humano lo contacte para coordinarla manualmente. NUNCA digas que la cita quedó agendada o confirmada: no tienes forma de agendarla en este momento."
      : "";

  const system = [input.systemInstruction, toolsPromptBlock, schedulingUnavailableBlock]
    .filter(block => block.trim().length > 0)
    .join("\n\n");

  const messages: Anthropic.MessageParam[] = input.messages.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content
  }));

  const toolResults: AgentToolResult[] = [];
  let usage: GeminiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  let response = await withLlmTimeout(
    abortSignal =>
      createClaudeMessage(
        client,
        { model: input.model, system, messages, max_tokens: input.maxOutputTokens, temperature: input.temperature, tools },
        { signal: abortSignal }
      ),
    undefined,
    "Claude"
  );
  usage = addUsage(usage, readClaudeUsage(response));

  let rounds = 0;
  while (toolsEnabled && response.stop_reason === "tool_use" && rounds < 3) {
    rounds += 1;
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    messages.push({ role: "assistant", content: response.content });

    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUseBlocks) {
      const args = (call.input ?? {}) as Record<string, unknown>;
      const result = await executeAgentTool(enabledTools, call.name, args, {
        ...input.toolContext,
        ...rulesCtx
      });
      toolResults.push(result);
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify(result)
      });
    }

    messages.push({ role: "user", content: toolResultBlocks });

    response = await withLlmTimeout(
      abortSignal =>
        client.messages.create(
          { model: input.model, system, messages, max_tokens: input.maxOutputTokens, temperature: input.temperature, tools },
          { signal: abortSignal }
        ),
      undefined,
      "Claude"
    );
    usage = addUsage(usage, readClaudeUsage(response));
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("IA sin respuesta");

  return { text, usage, toolResults };
}
