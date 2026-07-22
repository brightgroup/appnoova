import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { getOriApiKey } from "@/lib/google-ai";
import { readGeminiUsage, type GeminiUsage } from "@/lib/billing/meter";
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

function toGeminiContents(messages: TextAgentChatMessage[]): Content[] {
  return messages.map(m => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }]
  }));
}

/**
 * Genera respuesta del agente de texto.
 * Las tools activas (notify_team, agendamiento, y las que se registren después en
 * `ALL_TEXT_AGENT_TOOLS`) se resuelven según las reglas del agente — no hay
 * despacho hardcodeado por nombre de tool aquí.
 */
export async function generateTextAgentReply(
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
  const systemInstruction = toolsPromptBlock
    ? `${input.systemInstruction}\n\n${toolsPromptBlock}`
    : input.systemInstruction;

  const ai = new GoogleGenAI({ apiKey });
  const contents = toGeminiContents(input.messages);
  const toolResults: AgentToolResult[] = [];

  const baseConfig = {
    systemInstruction,
    temperature: input.temperature,
    maxOutputTokens: input.maxOutputTokens,
    ...(toolsEnabled ? { tools: [{ functionDeclarations: buildFunctionDeclarations(enabledTools) }] } : {})
  };

  let response = await ai.models.generateContent({
    model: input.model,
    contents,
    config: baseConfig
  });

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

    response = await ai.models.generateContent({
      model: input.model,
      contents,
      config: baseConfig
    });
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
