import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { calificarAccidentesPersonales } from "@/lib/insurers/accident-quote-tool";

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
  buildPromptBlock() {
    return 'Tienes una herramienta (cotizar_seguro_accidentes) para REUNIR los datos de un seguro de Accidentes Personales (no da el precio directo — eso lo confirma un asesor). Este ramo es prácticamente todo con botones (usa presentar_opciones_whatsapp con estas opciones EXACTAS): ¿qué le gustaría proteger? (lista: "Muerte accidental", "Invalidez por accidente o enfermedad", "Renta diaria si me incapacito por cualquier causa", "Todas las anteriores", "No lo sé, asesórenme"); ¿para usted o una póliza colectiva? (botones "Para mí (individual)"/"Póliza colectiva"); ¿qué valor de cobertura? (lista: "10 millones", "Entre 10 y 20 millones", "Entre 20 y 50 millones", "Entre 50 y 100 millones", "Más de 100 millones", "No lo sé, asesórenme"); ¿ya tiene un seguro similar? (botones "Sí"/"No"). Luego pide en texto normal: nombre completo, documento y fecha de nacimiento del tomador. Cuando la herramienta confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes un precio tú mismo.';
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
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
        source: ctx.channel === "web_embed" || ctx.channel === "web_test" ? "web" : "whatsapp",
        conversationId: ctx.conversationId,
        contactE164: ctx.contactE164
      }
    );
    return { ...result };
  }
};
