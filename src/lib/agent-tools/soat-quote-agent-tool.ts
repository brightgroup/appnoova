import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { calificarSoat } from "@/lib/insurers/soat-quote-tool";
import { resolveCampos, buildCamposPromptBlock, presentGuidedQuestion } from "@/lib/agent-tools/guided-questions";

/** Tool de calificación de SOAT para agentes que hablan con el CLIENTE FINAL — mismo patrón que life/home-quote-agent-tool.ts. */
export const calificarSoatAgentTool: AgentToolDefinition = {
  name: "cotizar_seguro_soat",
  declaration: {
    name: "cotizar_seguro_soat",
    description:
      "Reúne los datos para cotizar un SOAT (no da el precio directo — lo confirma un asesor). Úsala cada vez que el cliente pida cotizar o preguntar por el SOAT. Nunca inventes un precio.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        placa: { type: Type.STRING, description: "Placa del vehículo, sin espacios ni guiones." },
        motor_ultimos_digitos: { type: Type.STRING, description: "Últimos 4 dígitos del número de motor." },
        ciudad: { type: Type.STRING, description: "Ciudad donde circula el vehículo." },
        nombre_tomador: { type: Type.STRING, description: "Nombre completo de quien toma la póliza." },
        documento_tomador: { type: Type.STRING, description: "Número de documento de identidad del tomador." },
        fecha_nacimiento_tomador: {
          type: Type.STRING,
          description: "Fecha de nacimiento del tomador en formato YYYY-MM-DD."
        }
      },
      required: ["placa", "motor_ultimos_digitos", "ciudad", "nombre_tomador", "documento_tomador", "fecha_nacimiento_tomador"]
    }
  },
  isEnabled(ctx) {
    return ctx.quotingRules.enabled;
  },
  buildPromptBlock(ctx) {
    const campos = resolveCampos(ctx, "soat");
    return `Tienes una herramienta (cotizar_seguro_soat) para REUNIR los datos de un SOAT (no da el precio directo — eso lo confirma un asesor). Es el ramo más simple, son puros datos abiertos. ${buildCamposPromptBlock(campos)} Cuando la herramienta confirme que los datos quedaron completos, dile al cliente que un asesor le va a confirmar el precio en breve — nunca inventes ni aproximes un precio tú mismo.`;
  },
  async execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<AgentToolResult> {
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const campos = resolveCampos(ctx, "soat");
    const result = await calificarSoat(
      {
        placa: str(args.placa),
        motor_ultimos_digitos: str(args.motor_ultimos_digitos),
        ciudad: str(args.ciudad),
        nombre_tomador: str(args.nombre_tomador),
        documento_tomador: str(args.documento_tomador),
        fecha_nacimiento_tomador: str(args.fecha_nacimiento_tomador)
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
