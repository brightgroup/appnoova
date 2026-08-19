import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { getOriApiKey } from "@/lib/google-ai";
import { readGeminiUsage, type GeminiUsage } from "@/lib/billing/meter";
import { withGeminiTimeout } from "@/lib/gemini-timeout";
import { normalizeNotifyTeamRules, type NotifyTeamRules } from "@/lib/text-notify-rules";
import { normalizeSchedulingRules, normalizeOrgBusinessHours, type SchedulingRules, type OrgBusinessHours } from "@/lib/scheduling/rules";
import { ALL_TEXT_AGENT_TOOLS } from "@/lib/agent-tools/all-text-tools";
import {
  resolveEnabledTools,
  buildToolsPromptBlock,
  buildFunctionDeclarations,
  executeAgentTool,
  type AgentToolContext,
  type AgentToolResult
} from "@/lib/agent-tools/registry";
import type { CalendarConnectionRecord } from "@/lib/google-calendar/connections-db";

export interface TextAgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateTextAgentReplyInput {
  model: string;
  systemInstruction: string;
  messages: TextAgentChatMessage[];
  temperature: number;
  maxOutputTokens: number;
  notifyRules?: NotifyTeamRules | unknown;
  schedulingRules?: SchedulingRules | unknown;
  businessHours?: OrgBusinessHours | unknown;
  calendarConnection?: CalendarConnectionRecord | null;
  toolContext: Omit<AgentToolContext, "notifyRules" | "schedulingRules" | "businessHours" | "calendarConnection">;
}

export interface GenerateTextAgentReplyResult {
  text: string;
  usage: GeminiUsage;
  toolResults: AgentToolResult[];
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /"code":\s*(503|429)|"status":\s*"(UNAVAILABLE|RESOURCE_EXHAUSTED)"/.test(msg);
}

/**
 * Gemini devuelve 503 "high demand" de forma intermitente; un segundo intento
 * a los pocos segundos casi siempre pasa. Sin esto, un solo error transitorio
 * dejaba al cliente sin respuesta y sin ningún aviso.
 */
async function withOneRetryOnOverload<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientGeminiError(err)) throw err;
    await new Promise(resolve => setTimeout(resolve, 1500));
    return await fn();
  }
}

function toGeminiContents(messages: TextAgentChatMessage[]): Content[] {
  return messages.map(m => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }]
  }));
}

/**
 * Genera respuesta del agente de texto. Despacha por proveedor según el prefijo
 * del modelo guardado en la BD: `claude-*` va a Anthropic (ver
 * text-agent-generate-claude.ts), cualquier otro valor (por ahora solo
 * `gemini-*`) sigue el camino de Gemini de siempre. Quien llama no necesita
 * saber qué proveedor hay detrás.
 */
export async function generateTextAgentReply(
  input: GenerateTextAgentReplyInput
): Promise<GenerateTextAgentReplyResult> {
  if (input.model.startsWith("claude-")) {
    const { generateClaudeAgentReply } = await import("@/lib/text-agent-generate-claude");
    return generateClaudeAgentReply(input);
  }
  return generateGeminiAgentReply(input);
}

/**
 * Las tools activas (notify_team, agendamiento, y las que se registren después en
 * `ALL_TEXT_AGENT_TOOLS`) se resuelven según las reglas del agente — no hay
 * despacho hardcodeado por nombre de tool aquí.
 */
async function generateGeminiAgentReply(
  input: GenerateTextAgentReplyInput
): Promise<GenerateTextAgentReplyResult> {
  const apiKey = getOriApiKey();
  if (!apiKey) throw new Error("Falta ORI_GOOGLE_AI_KEY");

  const rulesCtx = {
    notifyRules: normalizeNotifyTeamRules(input.notifyRules),
    schedulingRules: normalizeSchedulingRules(input.schedulingRules),
    businessHours: normalizeOrgBusinessHours(input.businessHours),
    calendarConnection: input.calendarConnection ?? null
  };

  const enabledTools = resolveEnabledTools(ALL_TEXT_AGENT_TOOLS, rulesCtx);
  const toolsEnabled = enabledTools.length > 0;
  const toolsPromptBlock = buildToolsPromptBlock(enabledTools, rulesCtx);

  // El agente tiene agendamiento activado pero sin calendario conectado (o caído):
  // sin esto, el modelo no tiene ninguna señal de que el agendamiento existe y
  // termina inventando una confirmación de cita que nunca se creó en ningún lado.
  const schedulingUnavailableBlock =
    rulesCtx.schedulingRules.enabled && !rulesCtx.calendarConnection
      ? "IMPORTANTE — Agendamiento no disponible ahora mismo: el calendario está desconectado por un problema técnico. Si el usuario pide agendar una cita, discúlpate, explica que hay un inconveniente técnico y ofrece que un asesor humano lo contacte para coordinarla manualmente. NUNCA digas que la cita quedó agendada o confirmada: no tienes forma de agendarla en este momento."
      : "";

  const systemInstruction = [input.systemInstruction, toolsPromptBlock, schedulingUnavailableBlock]
    .filter(block => block.trim().length > 0)
    .join("\n\n");

  const ai = new GoogleGenAI({ apiKey });
  const contents = toGeminiContents(input.messages);
  const toolResults: AgentToolResult[] = [];

  const baseConfig = {
    systemInstruction,
    temperature: input.temperature,
    maxOutputTokens: input.maxOutputTokens,
    // Thinking siempre apagado. Gemini 2.5 cuenta los tokens de "pensamiento"
    // interno dentro del mismo presupuesto de maxOutputTokens (con topes bajos
    // dejaba la respuesta visible cortada) y los factura como salida en un
    // contador aparte (thoughtsTokenCount) que el medidor de consumo no lee.
    // Se midió contra el agente de catálogo más difícil que tenemos —nombres de
    // producto casi idénticos con precios muy distintos— y no evitó ni un solo
    // dato equivocado: solo triplicó la latencia. Lo que sí evita datos falsos
    // es la validación contra la tabla (src/lib/data-tables/catalog-guard.ts).
    thinkingConfig: { thinkingBudget: 0 },
    ...(toolsEnabled ? { tools: [{ functionDeclarations: buildFunctionDeclarations(enabledTools) }] } : {})
  };

  let response = await withOneRetryOnOverload(() =>
    withGeminiTimeout(abortSignal =>
      ai.models.generateContent({
        model: input.model,
        contents,
        config: { ...baseConfig, abortSignal }
      })
    )
  );

  let rounds = 0;
  while (toolsEnabled && response.functionCalls?.length && rounds < 3) {
    rounds += 1;
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) {
      contents.push(modelContent);
    } else {
      // Fallback: reconstruir parts desde functionCalls
      contents.push({
        role: "model",
        parts: response.functionCalls.map(fc => ({
          functionCall: { name: fc.name, args: fc.args, id: fc.id }
        }))
      });
    }

    const functionResponseParts: Part[] = [];
    for (const call of response.functionCalls) {
      const args = (call.args ?? {}) as Record<string, unknown>;
      const name = call.name ?? "";
      const result = await executeAgentTool(enabledTools, name, args, {
        ...input.toolContext,
        ...rulesCtx
      });
      toolResults.push(result);
      functionResponseParts.push({
        functionResponse: {
          name,
          id: call.id,
          response: result as unknown as Record<string, unknown>
        }
      });
    }

    contents.push({ role: "user", parts: functionResponseParts });

    response = await withOneRetryOnOverload(() =>
      withGeminiTimeout(abortSignal =>
        ai.models.generateContent({
          model: input.model,
          contents,
          config: { ...baseConfig, abortSignal }
        })
      )
    );
  }

  const text = response.text?.trim() ?? "";
  if (!text) {
    throw new Error("IA sin respuesta");
  }

  return {
    text,
    usage: readGeminiUsage(response),
    toolResults
  };
}
