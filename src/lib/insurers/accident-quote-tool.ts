import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertPendingQuoteRequest, type QuoteRequestSource } from "@/lib/insurers/quote-requests-db";

/**
 * Calificación de seguro de Accidentes Personales (sin conector de
 * aseguradora todavía) — mismo espíritu que life-quote-tool.ts: siempre cola
 * humana. Ramo íntegramente de opción múltiple (nada de direcciones,
 * inmuebles ni vehículos), ideal para probar el patrón de botones al máximo.
 */

export interface AccidentQuoteInput {
  /** "Muerte accidental" | "Invalidez por accidente o enfermedad" | "Renta diaria si me incapacito por cualquier causa" | "Todas las anteriores" | "No lo sé, asesórenme" */
  proteccion_deseada?: string;
  /** "Para mí (individual)" | "Póliza colectiva" */
  tipo_poliza?: string;
  /** "10 millones" | "Entre 10 y 20 millones" | "Entre 20 y 50 millones" | "Entre 50 y 100 millones" | "Más de 100 millones" | "No lo sé, asesórenme" */
  valor_cobertura?: string;
  /** "Sí" | "No" */
  ya_tiene_seguro?: string;
  nombre_tomador?: string;
  documento_tomador?: string;
  /** YYYY-MM-DD */
  fecha_nacimiento_tomador?: string;
}

export interface AccidentQuoteResult {
  ok: boolean;
  reason?: string;
  faltan_datos?: string[];
  pendiente?: boolean;
  quote_request_id?: string;
}

export interface AccidentQuoteOptions {
  source: QuoteRequestSource;
  conversationId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  contactE164?: string | null;
}

const REQUIRED_FIELDS = [
  "proteccion_deseada",
  "tipo_poliza",
  "valor_cobertura",
  "ya_tiene_seguro",
  "nombre_tomador",
  "documento_tomador",
  "fecha_nacimiento_tomador"
] as const;

export async function calificarAccidentesPersonales(
  input: AccidentQuoteInput,
  ctx: { db: SupabaseClient; organizationId: string },
  options: AccidentQuoteOptions
): Promise<AccidentQuoteResult> {
  const faltantes = REQUIRED_FIELDS.filter(field => !input[field]?.trim());
  if (faltantes.length > 0) {
    return { ok: true, faltan_datos: faltantes };
  }

  const tomador = {
    nombre_tomador: input.nombre_tomador!.trim(),
    documento_tomador: input.documento_tomador!.trim(),
    fecha_nacimiento_tomador: input.fecha_nacimiento_tomador!.trim()
  };

  const datosRiesgo = {
    proteccion_deseada: input.proteccion_deseada!.trim(),
    tipo_poliza: input.tipo_poliza!.trim(),
    valor_cobertura: input.valor_cobertura!.trim(),
    ya_tiene_seguro: input.ya_tiene_seguro!.trim()
  };

  const quoteRequest = await upsertPendingQuoteRequest(ctx.db, {
    organizationId: ctx.organizationId,
    conversationId: options.conversationId,
    contactId: options.contactId,
    leadId: options.leadId,
    contactE164: options.contactE164,
    source: options.source,
    ramo: "accidentes_personales",
    datosRiesgo,
    tomador
  });

  return { ok: true, pendiente: true, quote_request_id: quoteRequest.id };
}
