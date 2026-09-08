import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { listQuoteRequests, getQuoteRequestById, markQuoteRequestQuoted } from "@/lib/insurers/quote-requests-db";
import { ejecutarCotizacionReal, type AutoQuoteVehicle } from "@/lib/insurers/auto-quote-tool";

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
      "Lista las cotizaciones de seguro de auto que la IA ya calificó (tiene placa y datos del tomador) y están esperando que un asesor solicite el precio real. Úsala cuando te pregunten qué cotizaciones hay pendientes, o antes de solicitar una.",
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
        placa: q.placa,
        vehiculo: q.vehiculo,
        tomador: q.tomador,
        desde: q.createdAt
      }))
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
