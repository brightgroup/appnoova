import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertPendingQuoteRequest, type QuoteRequestSource } from "@/lib/insurers/quote-requests-db";

/**
 * Calificación de seguro de vida (sin conector de aseguradora todavía) — a
 * diferencia de autos, no hay ningún paso de cotización real: los datos
 * completos siempre quedan en la cola `insurance_quote_requests` para que un
 * asesor humano cotice y envíe el precio manualmente. Ver auto-quote-tool.ts
 * para el equivalente con cotización real (La Equidad).
 */

export interface LifeQuoteInput {
  nombre_tomador?: string;
  documento_tomador?: string;
  /** YYYY-MM-DD */
  fecha_nacimiento_tomador?: string;
  ocupacion?: string;
  /** Suma asegurada deseada, aproximada, en COP. */
  suma_asegurada_deseada?: string;
  fumador?: string;
}

export interface LifeQuoteResult {
  ok: boolean;
  reason?: string;
  faltan_datos?: string[];
  pendiente?: boolean;
  quote_request_id?: string;
}

export interface LifeQuoteOptions {
  source: QuoteRequestSource;
  conversationId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
}

const REQUIRED_FIELDS = [
  "nombre_tomador",
  "documento_tomador",
  "fecha_nacimiento_tomador",
  "ocupacion",
  "suma_asegurada_deseada"
] as const;

export async function calificarSeguroVida(
  input: LifeQuoteInput,
  ctx: { db: SupabaseClient; organizationId: string },
  options: LifeQuoteOptions
): Promise<LifeQuoteResult> {
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
    ocupacion: input.ocupacion!.trim(),
    suma_asegurada_deseada: input.suma_asegurada_deseada!.trim(),
    fumador: input.fumador?.trim() || null
  };

  const quoteRequest = await upsertPendingQuoteRequest(ctx.db, {
    organizationId: ctx.organizationId,
    conversationId: options.conversationId,
    contactId: options.contactId,
    leadId: options.leadId,
    source: options.source,
    ramo: "vida",
    tomador,
    datosRiesgo
  });

  return { ok: true, pendiente: true, quote_request_id: quoteRequest.id };
}
