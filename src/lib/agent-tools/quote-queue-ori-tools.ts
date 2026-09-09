import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { listQuoteRequests, getQuoteRequestById, markQuoteRequestQuoted } from "@/lib/insurers/quote-requests-db";
import { ejecutarCotizacionReal, type AutoQuoteVehicle } from "@/lib/insurers/auto-quote-tool";
import { getQuoteGuidanceForLead } from "@/lib/insurers/quote-guidance";

/**
 * Tools de ORI para la cola de cotizaciones (Fase "rediseño 2026-09-05") — el
 * corredor le puede preguntar a ORI qué cotizaciones tiene pendientes, y
 * pedirle que solicite el precio real de una en concreto, sin salir de la
 * conversación ni ir a buscar una pantalla aparte.
 */

export const consultarCotizacionesPendientesTool: OriToolDefinition = {
  name: "consultar_cotizaciones_pendientes",
  declaration: {
    name: "consultar_cotizaciones_pendientes",
    description:
      "Lista las cotizaciones de seguro (auto, vida u hogar) que la IA ya calificó y están esperando que un asesor solicite/confirme el precio real. Úsala cuando te pregunten qué cotizaciones hay pendientes, o antes de solicitar una.",
    parameters: { type: Type.OBJECT, properties: {} }
  },
  promptBlock:
    "Tienes una herramienta (consultar_cotizaciones_pendientes) para ver las cotizaciones ya calificadas por la IA que esperan que un asesor pida el precio real. Úsala cuando te pregunten por cotizaciones pendientes.",
  async execute(_args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const pendientes = await listQuoteRequests(ctx.db, ctx.organizationId, { estado: "pendiente" });
    return {
      ok: true,
      total: pendientes.length,
      cotizaciones: pendientes.map(q => ({
        id: q.id,
        lead_id: q.leadId,
        ramo: q.ramo,
        placa: q.placa,
        vehiculo: q.vehiculo,
        datos_riesgo: q.datosRiesgo,
        tomador: q.tomador,
        desde: q.createdAt
      }))
    };
  }
};

export const guiarCotizacionSeguroTool: OriToolDefinition = {
  name: "guiar_cotizacion_seguro",
  declaration: {
    name: "guiar_cotizacion_seguro",
    description:
      "Dice cuál es el SIGUIENTE PASO pendiente de la cotización de seguro de un lead específico (identificado por su lead_id, no el id de la cotización) — úsala cuando el asesor te pida ayuda para avanzar una cotización dentro de una oportunidad. No cotiza ni registra nada por su cuenta, solo te dice qué falta y qué otra herramienta usar después (solicitar_cotizacion_seguro para autos con aseguradora conectada, o pedirle al asesor que registre el precio manual desde la plataforma si no).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        lead_id: { type: Type.STRING, description: "Id del lead/oportunidad del CRM, no el id de la cotización." }
      },
      required: ["lead_id"]
    }
  },
  promptBlock:
    "Tienes una herramienta (guiar_cotizacion_seguro) para saber qué falta en la cotización de un lead específico — úsala cuando te pidan ayuda para avanzar una oportunidad de seguros. Dile al asesor exactamente el siguiente paso que te devuelva, no inventes uno distinto.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const leadId = typeof args.lead_id === "string" ? args.lead_id.trim() : "";
    if (!leadId) return { ok: false, reason: "Falta el lead_id." };

    const guidance = await getQuoteGuidanceForLead(ctx.db, ctx.organizationId, leadId);
    return {
      ok: true,
      paso: guidance.step,
      mensaje: guidance.message,
      cotizacion: guidance.quote
        ? {
            id: guidance.quote.id,
            ramo: guidance.quote.ramo,
            estado: guidance.quote.estado,
            resultado: guidance.quote.resultado
          }
        : null
    };
  }
};

export const solicitarCotizacionSeguroTool: OriToolDefinition = {
  name: "solicitar_cotizacion_seguro",
  declaration: {
    name: "solicitar_cotizacion_seguro",
    description:
      "Solicita el precio real de una cotización pendiente (identificada por su id, que trae consultar_cotizaciones_pendientes) contra la aseguradora conectada. Nunca inventes una prima si esta herramienta falla.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        cotizacion_id: { type: Type.STRING, description: "Id de la cotización pendiente a solicitar." }
      },
      required: ["cotizacion_id"]
    }
  },
  promptBlock:
    "Tienes una herramienta (solicitar_cotizacion_seguro) para pedir el precio real de una cotización pendiente por su id. Úsala cuando te pidan cotizar/solicitar el precio de una de las pendientes.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const id = typeof args.cotizacion_id === "string" ? args.cotizacion_id.trim() : "";
    if (!id) return { ok: false, reason: "Falta el id de la cotización." };

    const record = await getQuoteRequestById(ctx.db, ctx.organizationId, id);
    if (!record) return { ok: false, reason: "No encontré esa cotización pendiente." };
    if (record.estado !== "pendiente") {
      return { ok: false, reason: `Esa cotización ya está en estado "${record.estado}", no "pendiente".` };
    }
    if (record.ramo !== "autos") {
      return {
        ok: false,
        reason: `El ramo "${record.ramo}" todavía no tiene cotización automática — hay que cotizarlo manualmente contra la aseguradora y registrar el precio desde la plataforma.`
      };
    }
    const { nombre_tomador, documento_tomador, fecha_nacimiento_tomador } = record.tomador;
    if (!nombre_tomador || !documento_tomador || !fecha_nacimiento_tomador) {
      return { ok: false, reason: "Esa cotización no tiene todos los datos del tomador completos." };
    }

    const resultado = await ejecutarCotizacionReal(
      ctx,
      record.vehiculo as AutoQuoteVehicle,
      { nombre_tomador, documento_tomador, fecha_nacimiento_tomador }
    );

    if ("reason" in resultado) {
      return { ok: false, reason: resultado.reason };
    }

    await markQuoteRequestQuoted(ctx.db, record.id, {
      resultado: {
        aseguradora: resultado.aseguradora,
        prima: resultado.prima,
        vigencia_desde: resultado.vigencia_desde,
        vigencia_hasta: resultado.vigencia_hasta
      }
    });

    return { ok: true, vehiculo: record.vehiculo, ...resultado };
  }
};
