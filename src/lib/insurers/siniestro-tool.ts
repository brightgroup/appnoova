import type { SupabaseClient } from "@supabase/supabase-js";
import { getSiniestroPlaybook } from "@/lib/insurers/siniestro-playbook-db";
import { createSiniestro } from "@/lib/insurers/siniestros-db";

/**
 * Lógica compartida del copiloto de radicación de siniestros (S4, diseñado
 * 2026-09-05) — un único módulo, registrado dos veces como tool (ORI y el
 * agente que habla con el cliente final), mismo patrón que
 * src/lib/insurers/auto-quote-tool.ts.
 *
 * El objetivo legal: en Colombia la aseguradora tiene un mes para pagar
 * DESDE que la reclamación está "en forma" (documentación completa) — armar
 * el checklist completo desde el primer mensaje, no ir pidiendo papel por
 * papel en el camino, es lo que de verdad mueve la aguja.
 */

export interface RadicarSiniestroInput {
  aseguradora: string;
  ramo: string;
  descripcion?: string;
  fecha_ocurrencia?: string;
}

export interface RadicarSiniestroResult {
  ok: boolean;
  reason?: string;
  siniestro_id?: string;
  contacto?: string | null;
  documentos_requeridos?: string[];
  tiempo_respuesta?: string | null;
  /** false = no había playbook cargado para esa aseguradora+ramo — se creó el siniestro igual, pero sin checklist. */
  playbook_encontrado?: boolean;
}

export async function radicarSiniestro(
  input: RadicarSiniestroInput,
  ctx: { db: SupabaseClient; organizationId: string },
  options: { source: "whatsapp" | "web" | "ori" | "manual"; conversationId?: string | null; contactId?: string | null }
): Promise<RadicarSiniestroResult> {
  const aseguradora = input.aseguradora?.trim();
  const ramo = input.ramo?.trim();
  if (!aseguradora || !ramo) {
    return { ok: false, reason: "Falta la aseguradora o el ramo del siniestro." };
  }

  const playbook = await getSiniestroPlaybook(ctx.db, ctx.organizationId, aseguradora, ramo);

  const siniestro = await createSiniestro(ctx.db, {
    organizationId: ctx.organizationId,
    conversationId: options.conversationId,
    contactId: options.contactId,
    source: options.source,
    aseguradora,
    ramo,
    descripcion: input.descripcion,
    fechaOcurrencia: input.fecha_ocurrencia,
    checklistDocumentos: playbook?.documentos ?? []
  });

  return {
    ok: true,
    siniestro_id: siniestro.id,
    contacto: playbook?.contacto ?? null,
    documentos_requeridos: playbook?.documentos ?? [],
    tiempo_respuesta: playbook?.tiempoRespuesta ?? null,
    playbook_encontrado: Boolean(playbook)
  };
}
