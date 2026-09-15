import type { SupabaseClient } from "@supabase/supabase-js";
import {
  upsertPendingQuoteRequest,
  updateQuoteRequestDatos,
  getQuoteRequestById,
  type QuoteRequestSource,
  type QuoteRequestTomador
} from "@/lib/insurers/quote-requests-db";
import { getRamoCampoDefinitionsParaCotizar } from "@/lib/insurers/quote-guidance";
import { RAMOS_COTIZABLES, RAMOS_MOTOR_GENERICO, type RamoCotizable } from "@/lib/insurers/ramos-cotizables";

/**
 * Motor de calificación GENÉRICO para ramos sin conector de aseguradora ni
 * lookup propio (todo lo que no sea autos/motos, que consultan Verifik/
 * PlacApi por placa — ver auto-quote-tool.ts/moto-quote-tool.ts). Dos tools
 * que leen qué preguntar desde `poliza_ramo_campos` (con fallback a
 * ramo-campos-defaults.ts) — el mismo esquema editable que ya usa la ficha
 * del lead (SeguroQuotePanel.tsx) y la UI de Configuración → Preguntas que
 * hace la IA, así la IA y el asesor humano nunca piden datos distintos.
 *
 * Agregar un ramo nuevo a este motor es solo: 1) agregarlo a
 * RAMOS_COTIZABLES + RAMOS_MOTOR_GENERICO, 2) sus defaults en
 * ramo-campos-defaults.ts — nunca tocar este archivo.
 */

/** Datos personales comunes a casi todos los ramos (ver artefacto "Cotizador Conversacional") — van a `tomador`, no a `datos_riesgo`, porque son insumo compartido entre ramos, no específico de uno. */
const TOMADOR_KEYS = ["nombre_tomador", "documento_tomador", "fecha_nacimiento_tomador", "ocupacion", "ciudad"] as const;
const TOMADOR_REQUERIDOS: Array<{ key: (typeof TOMADOR_KEYS)[number]; label: string; pregunta: string }> = [
  { key: "nombre_tomador", label: "Nombre completo del tomador", pregunta: "¿Cuál es el nombre completo de quien toma la póliza?" },
  { key: "documento_tomador", label: "Número de documento del tomador", pregunta: "¿Cuál es el número de documento de identidad del tomador?" },
  { key: "fecha_nacimiento_tomador", label: "Fecha de nacimiento del tomador", pregunta: "¿Cuál es la fecha de nacimiento del tomador? (YYYY-MM-DD)" },
  { key: "ocupacion", label: "Ocupación del tomador", pregunta: "¿Cuál es la ocupación del tomador?" }
];

function splitCampos(campos: Record<string, string>): { tomador: Partial<QuoteRequestTomador>; datosRiesgo: Record<string, unknown> } {
  const tomador: Partial<QuoteRequestTomador> = {};
  const datosRiesgo: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(campos)) {
    if ((TOMADOR_KEYS as readonly string[]).includes(key)) {
      (tomador as Record<string, unknown>)[key] = value;
    } else {
      datosRiesgo[key] = value;
    }
  }
  return { tomador, datosRiesgo };
}

export interface PendingFieldInfo {
  key: string;
  label: string;
  tipo: string;
  opciones?: string[];
  /** Lo que la IA debe decirle al cliente para pedir el dato — si falta (campos de tomador fijos), se usa `label`. */
  pregunta?: string;
  ayuda?: string;
  presentacion?: "auto" | "botones" | "lista" | "texto";
  requeridoCotizacion?: boolean;
}

export interface GenericQuoteResult {
  ok: boolean;
  reason?: string;
  quote_request_id?: string;
  ramo?: string;
  completo?: boolean;
  faltan_datos?: PendingFieldInfo[];
}

async function buildResult(
  db: SupabaseClient,
  organizationId: string,
  quoteRequestId: string,
  ramo: string,
  tomador: QuoteRequestTomador,
  datosRiesgo: Record<string, unknown>
): Promise<GenericQuoteResult> {
  const faltantes: PendingFieldInfo[] = TOMADOR_REQUERIDOS.filter(f => !tomador[f.key]?.toString().trim()).map(f => ({
    key: f.key,
    label: f.label,
    tipo: "text",
    pregunta: f.pregunta,
    requeridoCotizacion: true
  }));

  const camposRamo = await getRamoCampoDefinitionsParaCotizar(db, organizationId, ramo);
  for (const campo of camposRamo) {
    const value = datosRiesgo[campo.fieldKey];
    const requerido = campo.requeridoCotizacion !== false;
    if ((value == null || value === "") && requerido) {
      faltantes.push({
        key: campo.fieldKey,
        label: campo.label,
        tipo: campo.fieldType,
        opciones: campo.options.length ? campo.options : undefined,
        pregunta: campo.pregunta,
        ayuda: campo.ayuda,
        presentacion: campo.presentacion,
        requeridoCotizacion: true
      });
    }
  }

  return {
    ok: true,
    quote_request_id: quoteRequestId,
    ramo,
    completo: faltantes.length === 0,
    faltan_datos: faltantes.length > 0 ? faltantes : undefined
  };
}

export interface IniciarCotizacionOptions {
  source: QuoteRequestSource;
  conversationId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  contactE164?: string | null;
}

/** Crea (o reutiliza, dentro de la misma conversación) la solicitud de cotización de un ramo y devuelve qué falta por preguntar. */
export async function iniciarCotizacionSeguro(
  db: SupabaseClient,
  organizationId: string,
  input: { ramo: string; campos?: Record<string, string> },
  opts: IniciarCotizacionOptions
): Promise<GenericQuoteResult> {
  const ramo = input.ramo?.trim().toLowerCase();
  if (!RAMOS_MOTOR_GENERICO.includes(ramo as RamoCotizable)) {
    return {
      ok: false,
      reason: `Ramo "${input.ramo}" no soportado todavía por este cotizador. Ramos disponibles: ${RAMOS_MOTOR_GENERICO.map(r => RAMOS_COTIZABLES[r].label).join(", ")} (autos usa su propia herramienta, cotizar_seguro_auto).`
    };
  }

  const { tomador, datosRiesgo } = splitCampos(input.campos ?? {});

  const quote = await upsertPendingQuoteRequest(db, {
    organizationId,
    conversationId: opts.conversationId,
    contactId: opts.contactId,
    leadId: opts.leadId,
    contactE164: opts.contactE164,
    source: opts.source,
    ramo,
    tomador,
    datosRiesgo
  });

  return buildResult(db, organizationId, quote.id, ramo, quote.tomador, quote.datosRiesgo);
}

/** Guarda respuestas nuevas sobre una cotización ya iniciada y devuelve qué sigue faltando. */
export async function registrarDatoCotizacion(
  db: SupabaseClient,
  organizationId: string,
  quoteRequestId: string,
  campos: Record<string, string>
): Promise<GenericQuoteResult> {
  const existing = await getQuoteRequestById(db, organizationId, quoteRequestId);
  if (!existing) return { ok: false, reason: "No encontré esa cotización — vuelve a iniciarla con iniciar_cotizacion_seguro." };

  const { tomador, datosRiesgo } = splitCampos(campos);
  const updated = await updateQuoteRequestDatos(db, organizationId, quoteRequestId, { tomador, datosRiesgo });
  if (!updated) return { ok: false, reason: "No se pudo guardar la respuesta." };

  return buildResult(db, organizationId, updated.id, updated.ramo, updated.tomador, updated.datosRiesgo);
}
