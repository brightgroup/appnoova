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
  /** "Casa" | "Apartamento" | "Casa en condominio" | "Finca o casa campestre" */
  tipo_inmueble?: string;
  estrato?: string;
  /** Valor aproximado del inmueble, en COP. */
  valor_aproximado_inmueble?: string;
  /** "Sí" | "No" — ¿el inmueble tiene vigilancia o sistemas de seguridad? */
  vigilancia_seguridad?: string;
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
  contactE164?: string | null;
}

const REQUIRED_FIELDS = [
  "tipo_inmueble",
  "vigilancia_seguridad",
  "direccion_inmueble",
  "estrato",
  "valor_aproximado_inmueble",
  "nombre_tomador",
  "documento_tomador"
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
    valor_aproximado_inmueble: input.valor_aproximado_inmueble!.trim(),
    vigilancia_seguridad: input.vigilancia_seguridad!.trim()
  };

  const quoteRequest = await upsertPendingQuoteRequest(ctx.db, {
    organizationId: ctx.organizationId,
    conversationId: options.conversationId,
    contactId: options.contactId,
    leadId: options.leadId,
    contactE164: options.contactE164,
    source: options.source,
    ramo: "hogar",
    tomador,
    datosRiesgo
  });

  return { ok: true, pendiente: true, quote_request_id: quoteRequest.id };
}
