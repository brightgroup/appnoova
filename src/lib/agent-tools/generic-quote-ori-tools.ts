import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { cotizarSeguroGenerico } from "@/lib/insurers/generic-quote-tool";
import { RAMOS_MOTOR_GENERICO } from "@/lib/insurers/ramos-cotizables";

function campoStringOnly(args: Record<string, unknown>): Record<string, string> {
  const campos = args.campos;
  if (!campos || typeof campos !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(campos as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/**
 * Equivalente de ORI a `cotizar_seguro` (agente de texto) — mismo motor
 * (generic-quote-tool.ts), para cuando el asesor le pide a ORI que arranque
 * o siga una cotización sin abrir la ficha del lead. Igual que la versión de
 * texto: se debe llamar en cada turno con TODOS los campos conocidos hasta
 * ahora, no solo los nuevos (ver generic-quote-agent-tools.ts para el
 * detalle de por qué el diseño anterior de dos tools no era confiable).
 */
export const cotizarSeguroOriTool: OriToolDefinition = {
  name: "cotizar_seguro",
  declaration: {
    name: "cotizar_seguro",
    description: `Reúne los datos para cotizar un seguro de ${RAMOS_MOTOR_GENERICO.join(", ")} para un lead (nunca autos, que usa cotizar_seguro_auto). Llámala en cada turno con TODOS los datos que ya conoces de esta cotización, no solo los nuevos. Devuelve qué datos faltan.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        lead_id: { type: Type.STRING, description: "Id del lead/oportunidad del CRM." },
        ramo: { type: Type.STRING, description: `Ramo a cotizar. Uno de: ${RAMOS_MOTOR_GENERICO.join(", ")}.` },
        campos: {
          type: Type.OBJECT,
          description: "TODOS los datos ya conocidos de esta cotización, clave/valor — incluye los que ya habías enviado antes, no solo el más nuevo. Cada clave debe ser EXACTAMENTE el `key` que te devolvió `faltan_datos` para ese dato — nunca la abrevies ni la cambies."
        }
      },
      required: ["lead_id", "ramo", "campos"]
    }
  },
  promptBlock:
    "Tienes una herramienta (cotizar_seguro) para reunir los datos de una cotización de seguro de un lead — pásale lead_id, ramo, y en `campos` TODOS los datos que ya conoces hasta ahora (no solo los nuevos). Llámala de nuevo cada vez que sepas un dato adicional. Te dice qué datos faltan.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const leadId = typeof args.lead_id === "string" ? args.lead_id : "";
    const ramo = typeof args.ramo === "string" ? args.ramo : "";
    if (!leadId) return { ok: false, reason: "Falta el lead_id." };
    if (!ramo) return { ok: false, reason: "Falta el ramo." };
    const result = await cotizarSeguroGenerico(
      ctx.db,
      ctx.organizationId,
      { ramo, leadId, campos: campoStringOnly(args) },
      { source: "ori", leadId }
    );
    return { ...result };
  }
};
