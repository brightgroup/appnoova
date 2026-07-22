import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import {
  buildNotifyTeamPromptBlock,
  enabledAiNotifyTeamEvents
} from "@/lib/text-notify-rules";
import { executeNotifyTeamTool } from "@/lib/text-notify-team";

/**
 * `notify_team` como entrada del registro genérico de tools. Misma lógica que
 * antes (`src/lib/text-notify-team.ts`), solo adaptada al shape `AgentToolDefinition`
 * para que el loop de `text-agent-generate.ts` no tenga que conocerla por nombre.
 */
export const notifyTeamTool: AgentToolDefinition = {
  name: "notify_team",
  declaration: {
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
  },
  isEnabled(ctx) {
    return enabledAiNotifyTeamEvents(ctx.notifyRules).length > 0;
  },
  buildPromptBlock(ctx) {
    return buildNotifyTeamPromptBlock(ctx.notifyRules);
  },
  async execute(args, ctx: AgentToolContext): Promise<AgentToolResult> {
    const result = await executeNotifyTeamTool(
      {
        event: String(args.event ?? ""),
        summary: String(args.summary ?? ""),
        when_label: args.when_label ? String(args.when_label) : undefined
      },
      ctx
    );
    return result as unknown as AgentToolResult;
  }
};
