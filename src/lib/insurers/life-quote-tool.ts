import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertPendingQuoteRequest, type QuoteRequestSource } from "@/lib/insurers/quote-requests-db";
import type { RamoCampoDef } from "@/lib/insurers/ramo-campos-defaults";

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
  /** "Vida (muerte por cualquier causa)" | "Vida + Invalidez" | "Vida + Invalidez + Enfermedades Graves" | "Vida + Invalidez + Enfermedades + Renta diaria" | "No lo sé, asesórame" */
  tipo_cobertura?: string;
  /** Rango de valor de cobertura deseado (ver AUTO_ENUM... no, ver las 5 opciones en el prompt), no un número exacto. */
  suma_asegurada_deseada?: string;
  /** Rango de presupuesto mensual aproximado. */
  presupuesto_mensual?: string;
  /** "Sí" | "No" — determina el riesgo/prima, por eso es obligatorio (igual que en el formulario de Figuro). */
  fumador?: string;
  /** ¿Le interesa un fondo de ahorro con el seguro de vida? — opcional, cross-sell. */
  interes_ahorro?: string;
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
  contactE164?: string | null;
}

const ALL_FIELD_KEYS = [
  "tipo_cobertura",
  "suma_asegurada_deseada",
  "presupuesto_mensual",
  "fumador",
  "nombre_tomador",
  "documento_tomador",
  "fecha_nacimiento_tomador",
  "ocupacion",
  "interes_ahorro"
] as const;

/** Campos que de verdad bloquean la cotización — los que la config no marcó como opcionales (interes_ahorro es opcional por defecto, ver ramo-campos-defaults.ts). */
function requiredFields(campos: RamoCampoDef[]): typeof ALL_FIELD_KEYS[number][] {
  return ALL_FIELD_KEYS.filter(key => campos.find(c => c.fieldKey === key)?.requeridoCotizacion !== false);
}

export async function calificarSeguroVida(
  input: LifeQuoteInput,
  ctx: { db: SupabaseClient; organizationId: string },
  options: LifeQuoteOptions,
  campos: RamoCampoDef[]
): Promise<LifeQuoteResult> {
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
    ocupacion: input.ocupacion!.trim(),
    tipo_cobertura: input.tipo_cobertura!.trim(),
    suma_asegurada_deseada: input.suma_asegurada_deseada!.trim(),
    presupuesto_mensual: input.presupuesto_mensual!.trim(),
    fumador: input.fumador!.trim(),
    interes_ahorro: input.interes_ahorro?.trim() || null
  };

  const quoteRequest = await upsertPendingQuoteRequest(ctx.db, {
    organizationId: ctx.organizationId,
    conversationId: options.conversationId,
    contactId: options.contactId,
    leadId: options.leadId,
    contactE164: options.contactE164,
    source: options.source,
    ramo: "vida",
    tomador,
    datosRiesgo
  });

  return { ok: true, pendiente: true, quote_request_id: quoteRequest.id };
}
