import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { calificarSeguroHogar, ALL_FIELD_KEYS } from "@/lib/insurers/home-quote-tool";
import { resolveCampos, buildCamposPromptBlock, presentGuidedQuestion } from "@/lib/agent-tools/guided-questions";

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
        tipo_inmueble: {
          type: Type.STRING,
          description: 'Uno de: "Casa", "Apartamento", "Casa en condominio", "Finca o casa campestre".'
        },
        vigilancia_seguridad: {
          type: Type.STRING,
          description: '¿Tiene vigilancia o sistemas de seguridad? Uno de: "Sí", "No".'
        },
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        direccion_inmueble: { type: Type.STRING, description: "Dirección del inmueble a asegurar." },
        estrato: { type: Type.STRING, description: "Estrato socioeconómico del inmueble (1 a 6)." },
        valor_aproximado_inmueble: {
          type: Type.STRING,
          description: "Valor aproximado del inmueble, en pesos colombianos."
        }
      },
      required: [
        "tipo_inmueble",
        "vigilancia_seguridad",
        "nombre_tomador",
        "documento_tomador",
        "direccion_inmueble",
        "estrato",
        "valor_aproximado_inmueble"
      ]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock(ctx) {
    const campos = resolveCampos(ctx, "hogar", ALL_FIELD_KEYS);
    return `Tienes una herramienta (cotizar_seguro_hogar) para REUNIR los datos de una cotización de seguro de hogar (no da el precio directo — eso lo confirma un asesor). ${buildCamposPromptBlock(campos)} Cuando la herramienta confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes una prima tú mismo.`;
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const campos = resolveCampos(ctx, "hogar", ALL_FIELD_KEYS);
    const result = await calificarSeguroHogar(
      {
        tipo_inmueble: str(args.tipo_inmueble),
        vigilancia_seguridad: str(args.vigilancia_seguridad),
        nombre_tomador: str(args.nombre_tomador),
        documento_tomador: str(args.documento_tomador),
        direccion_inmueble: str(args.direccion_inmueble),
        estrato: str(args.estrato),
        valor_aproximado_inmueble: str(args.valor_aproximado_inmueble)
      },
      ctx,
      {
        source: ctx.channel === "web_embed" || ctx.channel === "web_test" ? "web" : "whatsapp",
        conversationId: ctx.conversationId,
        contactE164: ctx.contactE164
      },
      campos
    );
    if (result.ok && result.faltan_datos && result.faltan_datos.length > 0) {
      const campo = campos.find(c => c.fieldKey === result.faltan_datos![0]);
      if (campo) return { ...result, ...(await presentGuidedQuestion(ctx, campo)) };
    }
    return { ...result };
  }
};
