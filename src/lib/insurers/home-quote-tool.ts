import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertPendingQuoteRequest, type QuoteRequestSource } from "@/lib/insurers/quote-requests-db";

/**
 * Calificación de seguro de hogar (sin conector de aseguradora todavía) —
 * mismo espíritu que life-quote-tool.ts: siempre cola humana, nunca precio
 * automático.
 */

export interface HomeQuoteInput {
  nombre_tomador?: string;
  documento_tomador?: string;
  direccion_inmueble?: string;
  /** "casa" | "apartamento" */
  tipo_inmueble?: string;
  estrato?: string;
  /** Valor aproximado del inmueble, en COP. */
  valor_aproximado_inmueble?: string;
}

export interface HomeQuoteResult {
  ok: boolean;
  reason?: string;
  faltan_datos?: string[];
  pendiente?: boolean;
  quote_request_id?: string;
}

export interface HomeQuoteOptions {
  source: QuoteRequestSource;
  conversationId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
}

const REQUIRED_FIELDS = [
  "nombre_tomador",
  "documento_tomador",
  "direccion_inmueble",
  "tipo_inmueble",
  "estrato",
  "valor_aproximado_inmueble"
] as const;

export async function calificarSeguroHogar(
  input: HomeQuoteInput,
  ctx: { db: SupabaseClient; organizationId: string },
  options: HomeQuoteOptions
): Promise<HomeQuoteResult> {
  const faltantes = REQUIRED_FIELDS.filter(field => !input[field]?.trim());
  if (faltantes.length > 0) {
    return { ok: true, faltan_datos: faltantes };
  }

  const tomador = {
    nombre_tomador: input.nombre_tomador!.trim(),
    documento_tomador: input.documento_tomador!.trim()
  };

  const datosRiesgo = {
    direccion_inmueble: input.direccion_inmueble!.trim(),
    tipo_inmueble: input.tipo_inmueble!.trim(),
    estrato: input.estrato!.trim(),
    valor_aproximado_inmueble: input.valor_aproximado_inmueble!.trim()
  };

  const quoteRequest = await upsertPendingQuoteRequest(ctx.db, {
    organizationId: ctx.organizationId,
    conversationId: options.conversationId,
    contactId: options.contactId,
    leadId: options.leadId,
    source: options.source,
    ramo: "hogar",
    tomador,
    datosRiesgo
  });

  return { ok: true, pendiente: true, quote_request_id: quoteRequest.id };
}
