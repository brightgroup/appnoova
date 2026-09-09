import type { SupabaseClient } from "@supabase/supabase-js";
import { getInsurerCredentials } from "@/lib/insurers/insurer-connections-db";
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
import {
  createQuotation,
  getQuotationDetail,
  LaEquidadApiError,
  type LaEquidadCredentials,
  type LaEquidadPerson
} from "@/lib/insurers/la-equidad";
import { upsertPendingQuoteRequest, markQuoteRequestQuoted, type QuoteRequestSource } from "@/lib/insurers/quote-requests-db";

/**
 * Lógica de negocio COMPARTIDA del cotizador de autos (Fase 2.2, rediseñada
 * 2026-09-05 con cola humana) — placa → datos del vehículo (Verifik) → prima
 * real (La Equidad, u otra aseguradora conectada más adelante). Registrada
 * dos veces como tool: para ORI (agent-tools/auto-quote-ori-tool.ts) y para
 * el agente de texto que habla con el cliente final (auto-quote-agent-tool.ts).
 *
 * DECISIÓN DE DISEÑO 2026-09-05 (pedida explícitamente por el usuario): por
 * defecto la IA CALIFICA (reúne placa + datos del tomador) y deja la
 * solicitud en la cola de `insurance_quote_requests` — es el asesor humano
 * quien, dentro de la plataforma, solicita el precio real con un clic. La
 * autonomía completa (la IA da el precio directo al cliente) sigue existiendo
 * como opción explícita (`options.autoQuote`, ver quoting_rules.autoQuote en
 * src/lib/insurers/quoting-rules.ts) para el corredor que la quiera prender.
 *
 * IMPORTANTE — sin verificar contra credenciales reales todavía: `branch` y
 * `plan_code` de La Equidad para el ramo autos no se conocen (se descubren
 * en runtime con GET /quote-template una vez haya credenciales de agente
 * reales). Por eso se leen de variables de entorno en vez de cablearlas a
 * mano — mientras no estén configuradas, la función se detiene ANTES de
 * llamar a La Equidad y lo dice explícitamente, en vez de adivinar valores.
 */

export interface AutoQuoteInput {
  placa: string;
  nombre_tomador?: string;
  documento_tomador?: string;
  /** YYYY-MM-DD */
  fecha_nacimiento_tomador?: string;
}

export type AutoQuoteVehicle = VehicleLookupResult;

export interface AutoQuoteResult {
  ok: boolean;
  reason?: string;
  vehiculo?: AutoQuoteVehicle;
  /** Nombres de campos de `AutoQuoteInput` que todavía hacen falta para poder cotizar. */
  faltan_datos?: string[];
  /** true cuando los datos ya están completos pero quedó en la cola para que un asesor solicite el precio. */
  pendiente?: boolean;
  quote_request_id?: string;
  aseguradora?: string;
  prima?: number | null;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
}

export interface AutoQuoteOptions {
  /** true = la IA da el precio real directo al cliente. false (default recomendado) = solo califica y encola para el asesor. */
  autoQuote: boolean;
  source: QuoteRequestSource;
  conversationId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  /** Número del contacto (WhatsApp) — clave del límite anti-abuso de Verifik cuando se usa la cuenta compartida de Noova. */
  contactE164?: string | null;
}

const REQUIRED_TOMADOR_FIELDS = ["nombre_tomador", "documento_tomador", "fecha_nacimiento_tomador"] as const;

/** Llama de verdad a la aseguradora conectada y devuelve la prima — usado tanto en modo autónomo como cuando el asesor solicita el precio manualmente desde la cola. */
export async function ejecutarCotizacionReal(
  ctx: { db: SupabaseClient; organizationId: string },
  vehiculo: AutoQuoteVehicle,
  tomador: Required<Pick<AutoQuoteInput, "nombre_tomador" | "documento_tomador" | "fecha_nacimiento_tomador">>
): Promise<
  | { ok: true; aseguradora: string; prima: number | null; vigencia_desde: string | null; vigencia_hasta: string | null }
  | { ok: false; reason: string }
> {
  const connection = await getInsurerCredentials<LaEquidadCredentials>(ctx.db, ctx.organizationId, "la_equidad");
  if (!connection) {
    return { ok: false, reason: "No hay ninguna aseguradora conectada todavía. Conéctala en Conectores → Aseguradoras." };
  }

  const branch = process.env.LA_EQUIDAD_AUTOS_BRANCH?.trim();
  const planCode = process.env.LA_EQUIDAD_AUTOS_PLAN_CODE?.trim();
  if (!branch || !planCode) {
    return {
      ok: false,
      reason:
        "El cotizador de autos de La Equidad todavía no está configurado del todo (faltan branch/plan_code del producto de autos) — se descubren con credenciales reales vía GET /quote-template."
    };
  }

  const person: LaEquidadPerson = {
    vinculacion: "tomador",
    tipo_persona: "NATURAL",
    codigo: tomador.documento_tomador.trim(),
    nombre: tomador.nombre_tomador.trim(),
    fecha_nacimiento: tomador.fecha_nacimiento_tomador.trim()
  };

  try {
    const summary = await createQuotation(connection.credentials, {
      Quote: [
        {
          certificate_type: "N",
          branch,
          plan_code: planCode,
          start_date: new Date().toISOString().slice(0, 10)
        }
      ],
      People: [person]
      // Detail: pendiente — el ramo autos probablemente exige detalles del
      // vehículo (ej. código Fasecolda) vía DetailData, por descubrir con
      // quote-template antes de mapear vehiculo.codigo_fasecolda aquí.
    });

    const detail = await getQuotationDetail(connection.credentials, summary);

    return {
      ok: true,
      aseguradora: "La Equidad Seguros",
      prima: detail.caratula.vprima,
      vigencia_desde: detail.caratula.fecini,
      vigencia_hasta: detail.caratula.fecter
    };
  } catch (err) {
    const reason = err instanceof LaEquidadApiError ? err.message : "No se pudo cotizar con La Equidad.";
    return { ok: false, reason };
  }
}

export async function cotizarSeguroAuto(
  input: AutoQuoteInput,
  ctx: { db: SupabaseClient; organizationId: string },
  options: AutoQuoteOptions
): Promise<AutoQuoteResult> {
  const placa = input.placa?.trim();
  if (!placa) return { ok: false, reason: "Falta la placa del vehículo." };

  const provider = await resolveVehicleDataProvider(ctx.db, ctx.organizationId);
  const contactKey = options.contactE164?.trim() || null;

  // PlacApi exige placa + documento del propietario en la misma consulta —
  // sin eso no se puede llamar, así que se pide como cualquier otro dato
  // faltante antes de gastar ninguna consulta.
  if (provider.requiresOwnerDocument && !input.documento_tomador?.trim()) {
    return { ok: true, faltan_datos: ["documento_tomador"] };
  }

  // El límite anti-abuso solo protege la cuenta COMPARTIDA de Noova — si el
  // corredor conectó su propia cuenta (de cualquiera de los dos
  // proveedores), ese gasto es suyo, no hay nada que limitar de parte de Noova.
  if (!provider.usingOwnAccount && contactKey) {
    const recentLookups = await countRecentVehicleLookups(ctx.db, ctx.organizationId, contactKey);
    if (recentLookups >= VEHICLE_LOOKUP_MAX_PER_WINDOW) {
      return {
        ok: false,
        reason:
          "Ya consultamos varios vehículos para este contacto hoy. Un asesor humano puede continuar la cotización manualmente."
      };
    }
  }

  let vehiculo: AutoQuoteVehicle;
  try {
    vehiculo = await provider.lookup(placa, input.documento_tomador);
  } catch (err) {
    const reason = isVehicleProviderApiError(err) ? err.message : "No se pudo consultar el vehículo por placa.";
    return { ok: false, reason };
  }
  if (!provider.usingOwnAccount && contactKey) {
    await logVehicleLookup(ctx.db, ctx.organizationId, contactKey, placa);
  }

  const faltantes = REQUIRED_TOMADOR_FIELDS.filter((field) => !input[field]?.trim());
  if (faltantes.length > 0) {
    return { ok: true, vehiculo, faltan_datos: faltantes };
  }

  const tomador = {
    nombre_tomador: input.nombre_tomador!.trim(),
    documento_tomador: input.documento_tomador!.trim(),
    fecha_nacimiento_tomador: input.fecha_nacimiento_tomador!.trim()
  };

  // Datos completos: siempre queda un registro en la cola, sea cual sea el
  // modo — así el asesor tiene historial incluso de las que sí se cotizaron solas.
  const quoteRequest = await upsertPendingQuoteRequest(ctx.db, {
    organizationId: ctx.organizationId,
    conversationId: options.conversationId,
    contactId: options.contactId,
    leadId: options.leadId,
    contactE164: options.contactE164,
    source: options.source,
    placa,
    vehiculo: vehiculo as unknown as Record<string, unknown>,
    tomador
  });

  if (!options.autoQuote) {
    return { ok: true, vehiculo, pendiente: true, quote_request_id: quoteRequest.id };
  }

  const resultado = await ejecutarCotizacionReal(ctx, vehiculo, tomador);
  if ("reason" in resultado) {
    // Falla la cotización automática, pero la solicitud queda en la cola
    // ('pendiente') para que un asesor la intente manualmente después.
    return { ok: false, vehiculo, reason: resultado.reason, quote_request_id: quoteRequest.id };
  }

  await markQuoteRequestQuoted(ctx.db, quoteRequest.id, {
    resultado: {
      aseguradora: resultado.aseguradora,
      prima: resultado.prima,
      vigencia_desde: resultado.vigencia_desde,
      vigencia_hasta: resultado.vigencia_hasta
    }
  });

  return {
    ok: true,
    vehiculo,
    quote_request_id: quoteRequest.id,
    aseguradora: resultado.aseguradora,
    prima: resultado.prima,
    vigencia_desde: resultado.vigencia_desde,
    vigencia_hasta: resultado.vigencia_hasta
  };
}
