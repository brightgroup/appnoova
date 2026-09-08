import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { cotizarSeguroAuto } from "@/lib/insurers/auto-quote-tool";

/**
 * Tool de cotización de autos para agentes que hablan con el CLIENTE FINAL
 * (WhatsApp/web) — comparte la misma lógica de negocio que la tool de ORI
 * (src/lib/agent-tools/auto-quote-ori-tool.ts), pero con su propio gating:
 * el interruptor explícito del agente (quoting_rules), no el acceso interno
 * de ORI. Hoy solo usa La Equidad — insurer_connection_ids queda listo para
 * cuando haya más de una aseguradora conectada por organización.
 */
export const cotizarSeguroAutoAgentTool: AgentToolDefinition = {
  name: "cotizar_seguro_auto",
  declaration: {
    name: "cotizar_seguro_auto",
    description:
      "Cotiza un seguro de auto real con la placa del vehículo y los datos del tomador, contra la aseguradora que esta empresa tiene conectada. Úsala cada vez que el cliente pida cotizar, asegurar o preguntar el precio de un seguro de auto. Nunca inventes una prima — si faltan datos, pídelos; si no hay aseguradora conectada o el cotizador no está listo, dilo tal cual.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        placa: { type: Type.STRING, description: "Placa del vehículo, sin espacios ni guiones." },
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        fecha_nacimiento_tomador: {
          type: Type.STRING,
          description: "Fecha de nacimiento del tomador en formato YYYY-MM-DD."
        }
      },
      required: ["placa"]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock(ctx) {
    return ctx.quotingRules.autoQuote
      ? "Tienes una herramienta (cotizar_seguro_auto) para cotizar seguros de auto de verdad. Pide la placa primero, y luego nombre completo, documento y fecha de nacimiento del tomador — de forma natural, no como un formulario. Si la herramienta dice que faltan datos, pide exactamente esos. Si dice que no hay aseguradora conectada o que el cotizador no está configurado del todo, comunícaselo tal cual al cliente — nunca inventes ni aproximes una prima."
      : "Tienes una herramienta (cotizar_seguro_auto) para REUNIR los datos de una cotización de auto (no te da el precio directo — eso lo confirma un asesor). Pide la placa primero, y luego nombre completo, documento y fecha de nacimiento del tomador, de forma natural. Cuando la herramienta confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes una prima tú mismo.";
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const result = await cotizarSeguroAuto(
      {
        placa: typeof args.placa === "string" ? args.placa : "",
        nombre_tomador: typeof args.nombre_tomador === "string" ? args.nombre_tomador : undefined,
        documento_tomador: typeof args.documento_tomador === "string" ? args.documento_tomador : undefined,
        fecha_nacimiento_tomador:
          typeof args.fecha_nacimiento_tomador === "string" ? args.fecha_nacimiento_tomador : undefined
      },
      ctx,
      {
        autoQuote: ctx.quotingRules.autoQuote,
        source: ctx.channel === "web_embed" || ctx.channel === "web_test" ? "web" : "whatsapp",
        conversationId: ctx.conversationId
      }
    );
    return { ...result };
  }
};
