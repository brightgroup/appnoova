import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { iniciarCotizacionSeguro, registrarDatoCotizacion } from "@/lib/insurers/generic-quote-tool";

function campoStringOnly(args: Record<string, unknown>): Record<string, string> {
  const campos = args.campos;
  if (!campos || typeof campos !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(campos as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** Equivalentes de ORI a los tools genéricos de agente de texto — mismo motor (generic-quote-tool.ts), para cuando el asesor le pide a ORI que arranque o siga una cotización de vida/hogar/salud sin abrir la ficha del lead. */
export const iniciarCotizacionSeguroOriTool: OriToolDefinition = {
  name: "iniciar_cotizacion_seguro",
  declaration: {
    name: "iniciar_cotizacion_seguro",
    description:
      "Arranca la cotización de un seguro de vida, hogar o salud para un lead (nunca autos, que usa cotizar_seguro_auto). Devuelve qué datos faltan.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        lead_id: { type: Type.STRING, description: "Id del lead/oportunidad del CRM." },
        ramo: { type: Type.STRING, description: "Ramo a cotizar: vida, hogar o salud." },
        campos: { type: Type.OBJECT, description: "Datos ya conocidos (opcional), clave/valor." }
      },
      required: ["lead_id", "ramo"]
    }
  },
  promptBlock:
    "Tienes una herramienta (iniciar_cotizacion_seguro) para arrancar una cotización de vida, hogar o salud en un lead — pásale lead_id y ramo. Te dice qué datos faltan.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const leadId = typeof args.lead_id === "string" ? args.lead_id : "";
    const ramo = typeof args.ramo === "string" ? args.ramo : "";
    if (!leadId) return { ok: false, reason: "Falta el lead_id." };
    const result = await iniciarCotizacionSeguro(
      ctx.db,
      ctx.organizationId,
      { ramo, campos: campoStringOnly(args) },
      { source: "ori", leadId }
    );
    return { ...result };
  }
};

export const registrarDatoCotizacionOriTool: OriToolDefinition = {
  name: "registrar_dato_cotizacion",
  declaration: {
    name: "registrar_dato_cotizacion",
    description: "Guarda respuestas nuevas sobre una cotización ya iniciada (vida, hogar o salud) por su quote_request_id.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        quote_request_id: { type: Type.STRING, description: "Id de la cotización." },
        campos: { type: Type.OBJECT, description: "Clave/valor de los datos nuevos." }
      },
      required: ["quote_request_id", "campos"]
    }
  },
  promptBlock:
    "Tienes una herramienta (registrar_dato_cotizacion) para guardar datos nuevos de una cotización de vida/hogar/salud ya iniciada, por su quote_request_id.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const quoteRequestId = typeof args.quote_request_id === "string" ? args.quote_request_id : "";
    if (!quoteRequestId) return { ok: false, reason: "Falta el quote_request_id." };
    const result = await registrarDatoCotizacion(ctx.db, ctx.organizationId, quoteRequestId, campoStringOnly(args));
    return { ...result };
  }
};
