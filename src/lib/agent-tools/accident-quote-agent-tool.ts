import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { calificarAccidentesPersonales, ALL_FIELD_KEYS } from "@/lib/insurers/accident-quote-tool";
import { resolveCampos, buildCamposPromptBlock, presentGuidedQuestion } from "@/lib/agent-tools/guided-questions";
import { resolveQuoteSource } from "@/lib/widget-channel";

/** Tool de calificación de Accidentes Personales para agentes que hablan con el CLIENTE FINAL. */
export const calificarAccidentesAgentTool: AgentToolDefinition = {
  name: "cotizar_seguro_accidentes",
  declaration: {
    name: "cotizar_seguro_accidentes",
    description:
      "Reúne los datos para cotizar un seguro de Accidentes Personales (no da el precio directo — lo confirma un asesor). Úsala cada vez que el cliente pida cotizar o preguntar por accidentes personales. Nunca inventes un precio.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        proteccion_deseada: {
          type: Type.STRING,
          description:
            'Uno de: "Muerte accidental", "Invalidez por accidente o enfermedad", "Renta diaria si me incapacito por cualquier causa", "Todas las anteriores", "No lo sé, asesórenme".'
        },
        tipo_poliza: { type: Type.STRING, description: 'Uno de: "Para mí (individual)", "Póliza colectiva".' },
        valor_cobertura: {
          type: Type.STRING,
          description:
            'Uno de: "10 millones", "Entre 10 y 20 millones", "Entre 20 y 50 millones", "Entre 50 y 100 millones", "Más de 100 millones", "No lo sé, asesórenme".'
        },
        ya_tiene_seguro: { type: Type.STRING, description: '¿Ya tiene un seguro de accidentes personales? Uno de: "Sí", "No".' },
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        fecha_nacimiento_tomador: {
          type: Type.STRING,
          description: "Fecha de nacimiento del tomador en formato YYYY-MM-DD."
        }
      },
      required: [
        "proteccion_deseada",
        "tipo_poliza",
        "valor_cobertura",
        "ya_tiene_seguro",
        "nombre_tomador",
        "documento_tomador",
        "fecha_nacimiento_tomador"
      ]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock(ctx) {
    const campos = resolveCampos(ctx, "accidentes_personales", ALL_FIELD_KEYS);
    return `Tienes una herramienta (cotizar_seguro_accidentes) para REUNIR los datos de un seguro de Accidentes Personales (no da el precio directo — eso lo confirma un asesor). ${buildCamposPromptBlock(campos)} Cuando la herramienta confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes un precio tú mismo.`;
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const campos = resolveCampos(ctx, "accidentes_personales", ALL_FIELD_KEYS);
    const result = await calificarAccidentesPersonales(
      {
        proteccion_deseada: str(args.proteccion_deseada),
        tipo_poliza: str(args.tipo_poliza),
        valor_cobertura: str(args.valor_cobertura),
        ya_tiene_seguro: str(args.ya_tiene_seguro),
        nombre_tomador: str(args.nombre_tomador),
        documento_tomador: str(args.documento_tomador),
        fecha_nacimiento_tomador: str(args.fecha_nacimiento_tomador)
      },
      ctx,
      {
        source: resolveQuoteSource(ctx.channel),
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
