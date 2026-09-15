import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveVehicleDataProvider,
  isVehicleProviderApiError,
  type VehicleLookupResult
} from "@/lib/insurers/vehicle-data-provider";
import {
  countRecentVehicleLookups,
  logVehicleLookup,
  VEHICLE_LOOKUP_MAX_PER_WINDOW
} from "@/lib/insurers/vehicle-lookup-rate-limit";
import { upsertPendingQuoteRequest, type QuoteRequestSource } from "@/lib/insurers/quote-requests-db";
import type { RamoCampoDef } from "@/lib/insurers/ramo-campos-defaults";

/**
 * Calificación de seguro de Motos — mismo patrón de datos de vehículo por
 * placa que auto-quote-tool.ts (PlacApi/Verifik resuelven marca/línea/año
 * automáticamente, así que no se preguntan), pero SIN cotización real: no hay
 * ningún conector de aseguradora para motos todavía, siempre cola humana
 * (mismo espíritu que life-quote-tool.ts/home-quote-tool.ts).
 */

export interface MotoQuoteInput {
  placa: string;
  /** "Nuevo" | "Usado" */
  nuevo_o_usado?: string;
  /** "Particular" | "Servicio Público" | "Uber/Cabify o similares" */
  uso_vehiculo?: string;
  /** "No" | "Sí, es de importación directa" | "No estoy seguro" */
  importacion_directa?: string;
  ciudad?: string;
  nombre_tomador?: string;
  documento_tomador?: string;
  /** YYYY-MM-DD */
  fecha_nacimiento_tomador?: string;
}

export type MotoQuoteVehicle = VehicleLookupResult;

export interface MotoQuoteResult {
  ok: boolean;
  reason?: string;
  vehiculo?: MotoQuoteVehicle;
  faltan_datos?: string[];
  pendiente?: boolean;
  quote_request_id?: string;
}

export interface MotoQuoteOptions {
  source: QuoteRequestSource;
  conversationId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  contactE164?: string | null;
}

const ALL_RIESGO_FIELD_KEYS = ["nuevo_o_usado", "uso_vehiculo", "importacion_directa", "ciudad"] as const;
const REQUIRED_TOMADOR_FIELDS = ["nombre_tomador", "documento_tomador", "fecha_nacimiento_tomador"] as const;

/** Campos de riesgo que de verdad bloquean la cotización — los que la config no marcó como opcionales. */
function requiredRiesgoFields(campos: RamoCampoDef[]): typeof ALL_RIESGO_FIELD_KEYS[number][] {
  return ALL_RIESGO_FIELD_KEYS.filter(key => campos.find(c => c.fieldKey === key)?.requeridoCotizacion !== false);
}

/** Todas las claves que la tool de verdad puede recibir (function-calling de Gemini tiene un esquema fijo) — usado para ignorar campos que un corredor haya agregado con una clave que esta tool no sabe dónde guardar. */
export const ALL_CAMPO_KEYS = [...ALL_RIESGO_FIELD_KEYS, ...REQUIRED_TOMADOR_FIELDS] as const;

export async function calificarSeguroMoto(
  input: MotoQuoteInput,
  ctx: { db: SupabaseClient; organizationId: string },
  options: MotoQuoteOptions,
  campos: RamoCampoDef[]
): Promise<MotoQuoteResult> {
  const placa = input.placa?.trim();
  if (!placa) return { ok: false, reason: "Falta la placa de la moto." };

  const provider = await resolveVehicleDataProvider(ctx.db, ctx.organizationId);
  const contactKey = options.contactE164?.trim() || null;

  if (provider.requiresOwnerDocument && !input.documento_tomador?.trim()) {
    return { ok: true, faltan_datos: ["documento_tomador"] };
  }

  if (!provider.usingOwnAccount && contactKey) {
    const recentLookups = await countRecentVehicleLookups(ctx.db, ctx.organizationId, contactKey);
    if (recentLookups >= VEHICLE_LOOKUP_MAX_PER_WINDOW) {
      return {
        ok: false,
        reason: "Ya consultamos varios vehículos para este contacto hoy. Un asesor humano puede continuar la cotización manualmente."
      };
    }
  }

  let vehiculo: MotoQuoteVehicle;
  try {
    vehiculo = await provider.lookup(placa, input.documento_tomador);
  } catch (err) {
    const reason = isVehicleProviderApiError(err) ? err.message : "No se pudo consultar la moto por placa.";
    return { ok: false, reason };
  }
  if (!provider.usingOwnAccount && contactKey) {
    await logVehicleLookup(ctx.db, ctx.organizationId, contactKey, placa);
  }

  const faltantesRiesgo = requiredRiesgoFields(campos).filter(field => !input[field]?.trim());
  if (faltantesRiesgo.length > 0) {
    return { ok: true, vehiculo, faltan_datos: faltantesRiesgo };
  }

  const faltantes = REQUIRED_TOMADOR_FIELDS.filter(field => !input[field]?.trim());
  if (faltantes.length > 0) {
    return { ok: true, vehiculo, faltan_datos: faltantes };
  }

  const tomador = {
    nombre_tomador: input.nombre_tomador!.trim(),
    documento_tomador: input.documento_tomador!.trim(),
    fecha_nacimiento_tomador: input.fecha_nacimiento_tomador!.trim()
  };

  const datosRiesgo = {
    nuevo_o_usado: input.nuevo_o_usado!.trim(),
    uso_vehiculo: input.uso_vehiculo!.trim(),
    importacion_directa: input.importacion_directa!.trim(),
    ciudad: input.ciudad!.trim()
  };

  const quoteRequest = await upsertPendingQuoteRequest(ctx.db, {
    organizationId: ctx.organizationId,
    conversationId: options.conversationId,
    contactId: options.contactId,
    leadId: options.leadId,
    contactE164: options.contactE164,
    source: options.source,
    ramo: "motos",
    placa,
    vehiculo: vehiculo as unknown as Record<string, unknown>,
    datosRiesgo,
    tomador
  });

  return { ok: true, vehiculo, pendiente: true, quote_request_id: quoteRequest.id };
}
