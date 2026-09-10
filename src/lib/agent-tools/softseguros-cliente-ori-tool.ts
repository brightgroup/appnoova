import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { getSoftsegurosCredentials } from "@/lib/softseguros/connections-db";
import { buscarClientePorDocumento, SoftsegurosApiError } from "@/lib/softseguros/client";

/**
 * Consulta en vivo (no un sync en bloque) — Softseguros expone
 * listar_cliente_por_documento como una búsqueda puntual, no un padrón
 * completo para volcar. Traer todos los clientes de una vez ensuciaría el
 * CRM con prospectos que nunca compraron nada; esta tool busca solo cuando
 * hace falta, igual que un corredor lo haría a mano en Softseguros.
 */
export const buscarClienteSoftsegurosTool: OriToolDefinition = {
  name: "buscar_cliente_softseguros",
  declaration: {
    name: "buscar_cliente_softseguros",
    description:
      "Busca un cliente en Softseguros por su número de documento (cédula o NIT) y trae sus datos reales (nombre, teléfono, email, si es cliente o prospecto). Úsala cuando te pidan datos de un cliente que puede estar en Softseguros pero no en Noova todavía. Nunca inventes datos de contacto — si la herramienta no lo encuentra o Softseguros no está conectado, dilo tal cual.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        documento: { type: Type.STRING, description: "Número de documento (cédula o NIT) del cliente a buscar." }
      },
      required: ["documento"]
    }
  },
  promptBlock:
    "Tienes una herramienta (buscar_cliente_softseguros) para buscar un cliente por documento directo en Softseguros — úsala cuando necesites datos de contacto de alguien que puede estar registrado ahí. Si no está conectado o no lo encuentra, dilo tal cual, no inventes el dato.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const documento = typeof args.documento === "string" ? args.documento.trim() : "";
    if (!documento) return { ok: false, reason: "Falta el número de documento." };

    const credentials = await getSoftsegurosCredentials(ctx.db, ctx.organizationId);
    if (!credentials) {
      return { ok: false, reason: "Softseguros no está conectado para esta organización." };
    }

    try {
      const raw = await buscarClientePorDocumento(credentials, documento);
      const resultados = Array.isArray((raw as { results?: unknown[] }).results)
        ? (raw as { results: Record<string, unknown>[] }).results
        : [raw];
      const cliente = resultados[0];
      if (!cliente || !cliente.numero_documento) {
        return { ok: false, reason: `No encontré ningún cliente con documento ${documento} en Softseguros.` };
      }

      return {
        ok: true,
        cliente: {
          nombres: cliente.nombres ?? null,
          apellidos: cliente.apellidos ?? null,
          tipo_documento: cliente.tipo_documento ?? null,
          numero_documento: cliente.numero_documento ?? null,
          celular: cliente.celular ?? null,
          telefono: cliente.telefono ?? null,
          email: cliente.email ?? null,
          tipo_cliente: cliente.tipo_cliente ?? null
        }
      };
    } catch (err) {
      const message =
        err instanceof SoftsegurosApiError ? err.message : err instanceof Error ? err.message : "Error consultando Softseguros";
      return { ok: false, reason: message };
    }
  }
};
