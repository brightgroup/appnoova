import type { SupabaseClient } from "@supabase/supabase-js";
import {
  upsertPendingQuoteRequest,
  updateQuoteRequestDatos,
  findPendingQuoteRequestByConversation,
  findPendingQuoteRequestByLead,
  type QuoteRequestSource,
  type QuoteRequestTomador
} from "@/lib/insurers/quote-requests-db";
import { getRamoCampoDefinitionsParaCotizar } from "@/lib/insurers/quote-guidance";
import { RAMOS_COTIZABLES, RAMOS_MOTOR_GENERICO, type RamoCotizable } from "@/lib/insurers/ramos-cotizables";

/**
 * Motor de calificación GENÉRICO para ramos sin conector de aseguradora ni
 * lookup propio (todo lo que no sea autos/motos, que consultan Verifik/
 * PlacApi por placa — ver auto-quote-tool.ts/moto-quote-tool.ts). Una sola
 * tool (`cotizarSeguroGenerico`) que lee qué preguntar desde
 * `poliza_ramo_campos` (con fallback a ramo-campos-defaults.ts) — el mismo
 * esquema editable que ya usa la ficha del lead (SeguroQuotePanel.tsx) y la
 * UI de Configuración → Preguntas que hace la IA, así la IA y el asesor
 * humano nunca piden datos distintos.
 *
 * DISEÑO 2026-09-15 (v2, reemplaza el de dos tools `iniciar_cotizacion_seguro`
 * + `registrar_dato_cotizacion`): esas dos tools resultaron NO ser confiables
 * en producción — el modelo las llamaba una sola vez, recibía la lista de
 * preguntas y después seguía la conversación de memoria sin volver a guardar
 * nada (confirmado con pruebas en vivo, ver docs/HANDOFF-CAMPOS-COTIZACION-CONFIGURABLES.md).
 * Ahora hay UNA sola tool que el modelo debe llamar en cada turno con TODOS
 * los campos que ya conoce de la conversación (no solo el más nuevo) —
 * exactamente el mismo patrón que ya funciona bien en los 6 ramos con tool
 * dedicada (auto-quote-tool.ts y hermanos: schema fijo, el modelo reenvía
 * todo lo que sabe en cada llamada). `updateQuoteRequestDatos` igual hace
 * merge con lo que ya había en DB como red de seguridad, por si el modelo
 * omite algún campo viejo en una llamada puntual.
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

export interface CotizarSeguroOptions {
  source: QuoteRequestSource;
  conversationId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  contactE164?: string | null;
}

/**
 * Única tool del motor genérico: el modelo la llama en CADA turno de la
 * conversación con el ramo y TODOS los campos que ya conoce hasta ahora (no
 * solo el más nuevo) — mismo contrato que `cotizarSeguroAuto`/
 * `calificarSeguroHogar` y hermanos. Encuentra (o crea, si es la primera
 * llamada) la solicitud "pendiente" de este ramo dentro de esta
 * conversación/lead — por organización + conversación/lead + ramo, nunca por
 * un id que el modelo tendría que recordar entre mensajes de WhatsApp (cada
 * mensaje entrante es un turno nuevo de `generateTextAgentReply` que solo ve
 * el texto final persistido de turnos anteriores, nunca las llamadas a tools
 * intermedias — ver `text_agent_conversations.messages`). `leadId` es para
 * las tools de ORI (guiar una cotización sin conversación de WhatsApp de por
 * medio, ver generic-quote-ori-tools.ts).
 */
export async function cotizarSeguroGenerico(
  db: SupabaseClient,
  organizationId: string,
  input: { ramo: string; conversationId?: string | null; leadId?: string | null; campos: Record<string, string> },
  opts: CotizarSeguroOptions
): Promise<GenericQuoteResult> {
  const ramo = input.ramo?.trim().toLowerCase();
  if (!RAMOS_MOTOR_GENERICO.includes(ramo as RamoCotizable)) {
    return {
      ok: false,
      reason: `Ramo "${input.ramo}" no soportado todavía por este cotizador. Ramos disponibles: ${RAMOS_MOTOR_GENERICO.map(r => RAMOS_COTIZABLES[r].label).join(", ")} (autos usa su propia herramienta, cotizar_seguro_auto).`
    };
  }

  const { tomador, datosRiesgo } = splitCampos(input.campos ?? {});

  const existing = input.conversationId
    ? await findPendingQuoteRequestByConversation(db, organizationId, input.conversationId, ramo)
    : input.leadId
      ? await findPendingQuoteRequestByLead(db, organizationId, input.leadId, ramo)
      : null;

  // Merge con lo que ya había en DB (no un reemplazo ciego) — red de
  // seguridad por si el modelo omite algún campo viejo en una llamada
  // puntual, aunque el prompt le pida reenviar todo lo que sabe cada vez.
  const quote = existing
    ? await updateQuoteRequestDatos(db, organizationId, existing.id, { tomador, datosRiesgo })
    : await upsertPendingQuoteRequest(db, {
        organizationId,
        conversationId: input.conversationId,
        contactId: opts.contactId,
        leadId: input.leadId,
        contactE164: opts.contactE164,
        source: opts.source,
        ramo,
        tomador,
        datosRiesgo
      });

  if (!quote) return { ok: false, reason: "No se pudo guardar la cotización." };
  return buildResult(db, organizationId, quote.id, ramo, quote.tomador, quote.datosRiesgo);
}
