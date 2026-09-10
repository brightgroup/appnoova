import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { resolveOrgCrmTenantUserId } from "@/lib/org-crm-tenant";

/**
 * Lee NUESTRA copia sincronizada de siniestros (ver sync-polizas/route.ts), no Softseguros en
 * vivo — su API no documenta un endpoint de "traer un siniestro por número/póliza", solo listado
 * paginado sin filtros. Pedirle a ORI que filtrara páginas completas en memoria cada vez sería
 * lento y frágil; leer la copia ya sincronizada es rápido y confiable. La descripción se lo dice
 * explícitamente al modelo para que nunca la presente como "en tiempo real segundo a segundo".
 */
export const consultarSiniestrosSoftsegurosTool: OriToolDefinition = {
  name: "consultar_siniestros_softseguros",
  declaration: {
    name: "consultar_siniestros_softseguros",
    description:
      "Busca los siniestros ya sincronizados desde Softseguros para una póliza (por su número) o un cliente (por su documento). Refleja la última sincronización, no el segundo exacto — si el corredor necesita el dato más fresco posible, sugiere sincronizar de nuevo desde Conectores → Softseguros. Nunca inventes el estado de un siniestro.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        numero_poliza_o_documento: {
          type: Type.STRING,
          description: "Número de póliza o número de documento del cliente/tomador a buscar."
        }
      },
      required: ["numero_poliza_o_documento"]
    }
  },
  promptBlock:
    "Tienes una herramienta (consultar_siniestros_softseguros) para ver el estado de siniestros ya traídos desde Softseguros, buscando por número de póliza o documento del cliente. Aclara que el dato es de la última sincronización, no en vivo segundo a segundo. Nunca inventes un estado si la herramienta no encuentra nada.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const query = typeof args.numero_poliza_o_documento === "string" ? args.numero_poliza_o_documento.trim() : "";
    if (!query) return { ok: false, reason: "Falta el número de póliza o de documento." };

    const crmUserId = await resolveOrgCrmTenantUserId(ctx.organizationId, "");
    if (!crmUserId) return { ok: false, reason: "No se pudo resolver la organización." };

    const { data: polizas } = await ctx.db
      .from("polizas")
      .select("id, numero_poliza, contact_id")
      .eq("user_id", crmUserId)
      .eq("numero_poliza", query);

    let polizaIds = (polizas ?? []).map(p => p.id as string);

    if (polizaIds.length === 0) {
      const { data: contacto } = await ctx.db
        .from("crm_contacts")
        .select("id")
        .eq("user_id", crmUserId)
        .eq("documento_id", query)
        .maybeSingle();
      if (contacto) {
        const { data: polizasPorContacto } = await ctx.db
          .from("polizas")
          .select("id")
          .eq("user_id", crmUserId)
          .eq("contact_id", contacto.id);
        polizaIds = (polizasPorContacto ?? []).map(p => p.id as string);
      }
    }

    if (polizaIds.length === 0) {
      return { ok: false, reason: `No encontré ninguna póliza sincronizada con "${query}" (ni como número de póliza ni como documento de cliente).` };
    }

    const { data: siniestros } = await ctx.db
      .from("siniestros")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .eq("source", "softseguros")
      .in("poliza_id", polizaIds)
      .order("fecha_aviso", { ascending: false });

    if (!siniestros || siniestros.length === 0) {
      return { ok: true, total: 0, siniestros: [], mensaje: "No hay siniestros sincronizados de Softseguros para esa póliza/cliente." };
    }

    return {
      ok: true,
      total: siniestros.length,
      siniestros: siniestros.map(s => ({
        estado: s.estado,
        descripcion: s.descripcion,
        fecha_aviso: s.fecha_aviso,
        fecha_ocurrencia: s.fecha_ocurrencia
      }))
    };
  }
};
