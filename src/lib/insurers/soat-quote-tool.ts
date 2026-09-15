import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertPendingQuoteRequest, type QuoteRequestSource } from "@/lib/insurers/quote-requests-db";
import type { RamoCampoDef } from "@/lib/insurers/ramo-campos-defaults";

/**
 * Calificación de SOAT (sin conector de aseguradora todavía) — el esquema más
 * corto de los ramos de Figuro: solo 3 datos propios, sin consultar
 * PlacApi/Verifik (a diferencia de auto-quote-tool.ts/moto-quote-tool.ts, el
 * SOAT es de precio regulado por ley y no depende de marca/línea/año para
 * cotizar, así que no vale la pena gastar una consulta de placa aquí). Mismo
 * espíritu que life-quote-tool.ts/home-quote-tool.ts: siempre cola humana.
 */

export interface SoatQuoteInput {
  placa?: string;
  /** Últimos 4 dígitos del número de motor. */
  motor_ultimos_digitos?: string;
  ciudad?: string;
  nombre_tomador?: string;
  documento_tomador?: string;
  /** YYYY-MM-DD */
  fecha_nacimiento_tomador?: string;
}

export interface SoatQuoteResult {
  ok: boolean;
  reason?: string;
  faltan_datos?: string[];
  pendiente?: boolean;
  quote_request_id?: string;
}

export interface SoatQuoteOptions {
  source: QuoteRequestSource;
  conversationId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  contactE164?: string | null;
}

const ALL_FIELD_KEYS = ["placa", "motor_ultimos_digitos", "ciudad", "nombre_tomador", "documento_tomador", "fecha_nacimiento_tomador"] as const;

/** Campos que de verdad bloquean la cotización — los que la config no marcó como opcionales. */
function requiredFields(campos: RamoCampoDef[]): typeof ALL_FIELD_KEYS[number][] {
  return ALL_FIELD_KEYS.filter(key => campos.find(c => c.fieldKey === key)?.requeridoCotizacion !== false);
}

export async function calificarSoat(
  input: SoatQuoteInput,
  ctx: { db: SupabaseClient; organizationId: string },
  options: SoatQuoteOptions,
  campos: RamoCampoDef[]
): Promise<SoatQuoteResult> {
  const faltantes = requiredFields(campos).filter(field => !input[field]?.trim());
  if (faltantes.length > 0) {
    return { ok: true, faltan_datos: faltantes };
  }

  const tomador = {
    nombre_tomador: input.nombre_tomador!.trim(),
    documento_tomador: input.documento_tomador!.trim(),
    fecha_nacimiento_tomador: input.fecha_nacimiento_tomador!.trim()
  };

  const datosRiesgo = {
    motor_ultimos_digitos: input.motor_ultimos_digitos!.trim(),
    ciudad: input.ciudad!.trim()
  };

  const quoteRequest = await upsertPendingQuoteRequest(ctx.db, {
    organizationId: ctx.organizationId,
    conversationId: options.conversationId,
    contactId: options.contactId,
    leadId: options.leadId,
    contactE164: options.contactE164,
    source: options.source,
    ramo: "soat",
    placa: input.placa!.trim(),
    datosRiesgo,
    tomador
  });

  return { ok: true, pendiente: true, quote_request_id: quoteRequest.id };
}
