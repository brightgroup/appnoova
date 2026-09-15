import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { calificarSeguroVida, ALL_FIELD_KEYS } from "@/lib/insurers/life-quote-tool";
import { resolveCampos, buildCamposPromptBlock, presentGuidedQuestion } from "@/lib/agent-tools/guided-questions";

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
        tipo_cobertura: {
          type: Type.STRING,
          description:
            'Uno de: "Vida (muerte por cualquier causa)", "Vida + Invalidez", "Vida + Invalidez + Enfermedades Graves", "Vida + Invalidez + Enfermedades + Renta diaria", "No lo sé, asesórame".'
        },
        suma_asegurada_deseada: {
          type: Type.STRING,
          description: 'Rango de cobertura deseado. Uno de: "Menos de 50 millones", "Entre 50 y 200 millones", "Entre 200 y 500 millones", "Más de 500 millones", "No lo sé, asesórame".'
        },
        presupuesto_mensual: {
          type: Type.STRING,
          description: 'Rango de presupuesto mensual. Uno de: "Hasta $50.000", "Hasta $150.000", "Hasta $300.000", "Más de $300.000", "No lo sé, asesórame".'
        },
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        fecha_nacimiento_tomador: {
          type: Type.STRING,
          description: "Fecha de nacimiento del tomador en formato YYYY-MM-DD."
        },
        ocupacion: { type: Type.STRING, description: "Ocupación u oficio del tomador." },
        fumador: { type: Type.STRING, description: '¿Fuma o tiene alguna condición médica? Uno de: "Sí", "No". Determina el riesgo — siempre se pregunta, nunca se omite.' },
        interes_ahorro: {
          type: Type.STRING,
          description: '¿Le interesa un fondo de ahorro con su seguro de vida? Uno de: "Sí", "No", "No lo sé, asesórame" (opcional — pregunta de cross-sell, no de calificación).'
        }
      },
      required: [
        "tipo_cobertura",
        "suma_asegurada_deseada",
        "presupuesto_mensual",
        "fumador",
        "nombre_tomador",
        "documento_tomador",
        "fecha_nacimiento_tomador",
        "ocupacion"
      ]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock(ctx) {
    const campos = resolveCampos(ctx, "vida", ALL_FIELD_KEYS);
    return `Tienes una herramienta (cotizar_seguro_vida) para REUNIR los datos de una cotización de seguro de vida (no da el precio directo — eso lo confirma un asesor). ${buildCamposPromptBlock(campos)} Cuando la herramienta confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes una prima tú mismo.`;
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const campos = resolveCampos(ctx, "vida", ALL_FIELD_KEYS);
    const result = await calificarSeguroVida(
      {
        tipo_cobertura: str(args.tipo_cobertura),
        suma_asegurada_deseada: str(args.suma_asegurada_deseada),
        presupuesto_mensual: str(args.presupuesto_mensual),
        nombre_tomador: str(args.nombre_tomador),
        documento_tomador: str(args.documento_tomador),
        fecha_nacimiento_tomador: str(args.fecha_nacimiento_tomador),
        ocupacion: str(args.ocupacion),
        fumador: str(args.fumador),
        interes_ahorro: str(args.interes_ahorro)
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
