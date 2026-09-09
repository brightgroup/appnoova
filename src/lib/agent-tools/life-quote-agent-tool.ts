import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { calificarSeguroVida } from "@/lib/insurers/life-quote-tool";

/**
 * Tool de calificación de seguro de vida para agentes que hablan con el
 * CLIENTE FINAL — mismo patrón que auto-quote-agent-tool.ts, pero sin modo
 * autónomo: siempre reúne datos y deja la solicitud en la cola humana.
 */
export const calificarSeguroVidaAgentTool: AgentToolDefinition = {
  name: "cotizar_seguro_vida",
  declaration: {
    name: "cotizar_seguro_vida",
    description:
      "Reúne los datos para cotizar un seguro de vida (no da el precio directo — lo confirma un asesor). Úsala cada vez que el cliente pida cotizar, asegurar o preguntar el precio de un seguro de vida. Nunca inventes una prima.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        fecha_nacimiento_tomador: {
          type: Type.STRING,
          description: "Fecha de nacimiento del tomador en formato YYYY-MM-DD."
        },
        ocupacion: { type: Type.STRING, description: "Ocupación u oficio del tomador." },
        suma_asegurada_deseada: {
          type: Type.STRING,
          description: "Suma asegurada aproximada que el cliente quiere, en pesos colombianos."
        },
        fumador: { type: Type.STRING, description: "Si el tomador fuma o no (opcional)." }
      },
      required: ["nombre_tomador", "documento_tomador", "fecha_nacimiento_tomador", "ocupacion", "suma_asegurada_deseada"]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock() {
    return "Tienes una herramienta (cotizar_seguro_vida) para REUNIR los datos de una cotización de seguro de vida (no da el precio directo — eso lo confirma un asesor). Pide de forma natural, no como un formulario: nombre completo, documento, fecha de nacimiento, ocupación y la suma asegurada que le gustaría tener. Cuando la herramienta confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes una prima tú mismo.";
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const result = await calificarSeguroVida(
      {
        nombre_tomador: typeof args.nombre_tomador === "string" ? args.nombre_tomador : undefined,
        documento_tomador: typeof args.documento_tomador === "string" ? args.documento_tomador : undefined,
        fecha_nacimiento_tomador:
          typeof args.fecha_nacimiento_tomador === "string" ? args.fecha_nacimiento_tomador : undefined,
        ocupacion: typeof args.ocupacion === "string" ? args.ocupacion : undefined,
        suma_asegurada_deseada:
          typeof args.suma_asegurada_deseada === "string" ? args.suma_asegurada_deseada : undefined,
        fumador: typeof args.fumador === "string" ? args.fumador : undefined
      },
      ctx,
      {
        source: ctx.channel === "web_embed" || ctx.channel === "web_test" ? "web" : "whatsapp",
        conversationId: ctx.conversationId,
        contactE164: ctx.contactE164
      }
    );
    return { ...result };
  }
};
