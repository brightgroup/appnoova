import { GoogleGenAI, Type, type Content, type Part } from "@google/genai";
import { getOriApiKey } from "@/lib/google-ai";
import { readGeminiUsage, type GeminiUsage } from "@/lib/billing/meter";
import {
  buildNotifyTeamPromptBlock,
  enabledNotifyTeamEvents,
  normalizeNotifyTeamRules,
  type NotifyTeamRules
} from "@/lib/text-notify-rules";
import {
  executeNotifyTeamTool,
  type NotifyTeamToolContext,
  type NotifyTeamToolResult
} from "@/lib/text-notify-team";

export const NOTIFY_TEAM_FUNCTION_DECLARATION = {
  name: "notify_team",
  description:
    "Notifica al equipo humano de la empresa sobre un evento importante de la conversación (cita agendada o intención de compra alta). Úsala solo cuando el evento sea concreto.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      event: {
        type: Type.STRING,
        description: "Tipo de evento",
        enum: ["appointment_booked", "purchase_intent"]
      },
      summary: {
        type: Type.STRING,
        description: "Resumen breve en español de lo ocurrido (quién, qué, detalles clave)"
      },
      when_label: {
        type: Type.STRING,
        description: "Fecha/hora de la cita si aplica (texto legible), o vacío"
      }
    },
    required: ["event", "summary"]
  }
};

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
  toolContext: Omit<NotifyTeamToolContext, "notifyRules">;
}

export interface GenerateTextAgentReplyResult {
  text: string;
  usage: GeminiUsage;
  toolResults: NotifyTeamToolResult[];
}

function toGeminiContents(messages: TextAgentChatMessage[]): Content[] {
  return messages.map(m => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }]
  }));
}

/**
 * Genera respuesta del agente de texto.
 * Si hay reglas notify activas, habilita la tool notify_team y ejecuta el loop.
 */
export async function generateTextAgentReply(
  input: GenerateTextAgentReplyInput
): Promise<GenerateTextAgentReplyResult> {
  const apiKey = getOriApiKey();
  if (!apiKey) throw new Error("Falta ORI_GOOGLE_AI_KEY");

  const rules = normalizeNotifyTeamRules(input.notifyRules);
  const toolsEnabled = enabledNotifyTeamEvents(rules).length > 0;
  const systemInstruction = toolsEnabled
    ? `${input.systemInstruction}\n\n${buildNotifyTeamPromptBlock(rules)}`
    : input.systemInstruction;

  const ai = new GoogleGenAI({ apiKey });
  const contents = toGeminiContents(input.messages);
  const toolResults: NotifyTeamToolResult[] = [];

  const baseConfig = {
    systemInstruction,
    temperature: input.temperature,
    maxOutputTokens: input.maxOutputTokens,
    ...(toolsEnabled
      ? { tools: [{ functionDeclarations: [NOTIFY_TEAM_FUNCTION_DECLARATION] }] }
      : {})
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
      const args = (call.args ?? {}) as {
        event?: string;
        summary?: string;
        when_label?: string;
      };
      let result: NotifyTeamToolResult;
      if (call.name === "notify_team") {
        result = await executeNotifyTeamTool(
          {
            event: String(args.event ?? ""),
            summary: String(args.summary ?? ""),
            when_label: args.when_label ? String(args.when_label) : undefined
          },
          { ...input.toolContext, notifyRules: rules }
        );
      } else {
        result = { ok: false, reason: `Tool desconocida: ${call.name}` };
      }
      toolResults.push(result);
      functionResponseParts.push({
        functionResponse: {
          name: call.name ?? "notify_team",
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
