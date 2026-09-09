import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { calificarSeguroHogar } from "@/lib/insurers/home-quote-tool";

/**
 * Tool de calificación de seguro de hogar para agentes que hablan con el
 * CLIENTE FINAL — mismo patrón que life-quote-agent-tool.ts.
 */
export const calificarSeguroHogarAgentTool: AgentToolDefinition = {
  name: "cotizar_seguro_hogar",
  declaration: {
    name: "cotizar_seguro_hogar",
    description:
      "Reúne los datos para cotizar un seguro de hogar (no da el precio directo — lo confirma un asesor). Úsala cada vez que el cliente pida cotizar, asegurar o preguntar el precio de un seguro de hogar. Nunca inventes una prima.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        direccion_inmueble: { type: Type.STRING, description: "Dirección del inmueble a asegurar." },
        tipo_inmueble: { type: Type.STRING, description: "Tipo de inmueble: casa o apartamento." },
        estrato: { type: Type.STRING, description: "Estrato socioeconómico del inmueble." },
        valor_aproximado_inmueble: {
          type: Type.STRING,
          description: "Valor aproximado del inmueble, en pesos colombianos."
        }
      },
      required: ["nombre_tomador", "documento_tomador", "direccion_inmueble", "tipo_inmueble", "estrato", "valor_aproximado_inmueble"]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock() {
    return "Tienes una herramienta (cotizar_seguro_hogar) para REUNIR los datos de una cotización de seguro de hogar (no da el precio directo — eso lo confirma un asesor). Pide de forma natural: nombre completo, documento, dirección del inmueble, tipo (casa o apartamento), estrato y valor aproximado del inmueble. Cuando la herramienta confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes una prima tú mismo.";
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const result = await calificarSeguroHogar(
      {
        nombre_tomador: typeof args.nombre_tomador === "string" ? args.nombre_tomador : undefined,
        documento_tomador: typeof args.documento_tomador === "string" ? args.documento_tomador : undefined,
        direccion_inmueble: typeof args.direccion_inmueble === "string" ? args.direccion_inmueble : undefined,
        tipo_inmueble: typeof args.tipo_inmueble === "string" ? args.tipo_inmueble : undefined,
        estrato: typeof args.estrato === "string" ? args.estrato : undefined,
        valor_aproximado_inmueble:
          typeof args.valor_aproximado_inmueble === "string" ? args.valor_aproximado_inmueble : undefined
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
