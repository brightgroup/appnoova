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
  buildPromptBlock() {
    return 'Tienes una herramienta (cotizar_seguro_vida) para REUNIR los datos de una cotización de seguro de vida (no da el precio directo — eso lo confirma un asesor). Pide de a uno, con botones (usa presentar_opciones_whatsapp con estas opciones EXACTAS, una pregunta por mensaje): ¿qué te gustaría proteger? (lista: "Vida (muerte por cualquier causa)", "Vida + Invalidez", "Vida + Invalidez + Enfermedades Graves", "Vida + Invalidez + Enfermedades + Renta diaria", "No lo sé, asesórame"); ¿qué valor de cobertura? (lista: "Menos de 50 millones", "Entre 50 y 200 millones", "Entre 200 y 500 millones", "Más de 500 millones", "No lo sé, asesórame"); ¿presupuesto mensual aproximado? (lista: "Hasta $50.000", "Hasta $150.000", "Hasta $300.000", "Más de $300.000", "No lo sé, asesórame"); ¿fuma o tiene alguna condición médica? (botones "Sí"/"No" — ESTA PREGUNTA ES OBLIGATORIA, nunca la saltes ni la des por hecha, siempre espera la respuesta del cliente antes de seguir). Luego pide en texto normal: nombre completo, documento, fecha de nacimiento y ocupación. Al final, de forma opcional (esta sí se puede omitir si el cliente ya quiere cerrar), pregunta con botones ("Sí"/"No"/"No lo sé, asesórame") si le interesa un fondo de ahorro con el seguro. Cuando la herramienta confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes una prima tú mismo.';
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
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
      }
    );
    return { ...result };
  }
};
