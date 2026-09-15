import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLatestQuoteRequestForLead,
  listQuoteRequestsForLead,
  getQuoteRequestById,
  type QuoteRequestRecord
} from "@/lib/insurers/quote-requests-db";
import { listCamposPorRamo } from "@/lib/insurers/poliza-ramo-campos-db";
import { listInsurerConnectionsForOrg } from "@/lib/insurers/insurer-connections-db";
import { RAMOS_COTIZABLES, ramoCotizableFromCatalogoSlug, type RamoCotizable } from "@/lib/insurers/ramos-cotizables";
import { DEFAULT_CAMPOS_POR_RAMO, type RamoCampoDef } from "@/lib/insurers/ramo-campos-defaults";

export interface QuoteRamoCampo extends RamoCampoDef {
  value: unknown;
}

/**
 * Definiciones de campo de un ramo cotizable — usado tanto para mostrar/editar
 * en el panel de configuración como para que los tools de cotización sepan qué
 * preguntar. Si la organización no ha guardado nada para este ramo, devuelve
 * los valores por defecto (`ramo-campos-defaults.ts`) tal cual — la IA nunca
 * se queda sin qué preguntar solo porque nadie abrió la configuración todavía.
 */
export async function getRamoCampoDefinitions(db: SupabaseClient, organizationId: string, ramo: string): Promise<RamoCampoDef[]> {
  const ramoCotizable = (Object.keys(RAMOS_COTIZABLES) as RamoCotizable[]).includes(ramo as RamoCotizable)
    ? (ramo as RamoCotizable)
    : null;
  if (!ramoCotizable) return [];

  const { data: catalogo } = await db
    .from("ramos_catalogo")
    .select("id")
    .eq("slug", RAMOS_COTIZABLES[ramoCotizable].catalogoSlug)
    .maybeSingle();
  if (!catalogo) return DEFAULT_CAMPOS_POR_RAMO[ramoCotizable] ?? [];

  const campos = await listCamposPorRamo(db, organizationId, catalogo.id as string);
  if (campos.length === 0) return DEFAULT_CAMPOS_POR_RAMO[ramoCotizable] ?? [];

  return campos.map(c => ({
    fieldKey: c.fieldKey,
    label: c.label,
    pregunta: c.pregunta ?? c.label,
    ayuda: c.ayuda ?? undefined,
    fieldType: c.fieldType,
    options: c.options,
    sortOrder: c.sortOrder,
    presentacion: c.presentacion,
    aplicaCotizacion: c.aplicaCotizacion,
    requeridoCotizacion: c.requeridoCotizacion
  }));
}

/** Solo los campos que la IA debe preguntar durante la cotización (`aplicaCotizacion`) — filtra los campos informativos que un corredor haya agregado para otros fines (metadata de póliza, no de calificación). */
export async function getRamoCampoDefinitionsParaCotizar(db: SupabaseClient, organizationId: string, ramo: string): Promise<RamoCampoDef[]> {
  const todos = await getRamoCampoDefinitions(db, organizationId, ramo);
  return todos.filter(c => c.aplicaCotizacion !== false);
}

/**
 * Precarga `ramoCampos` para TODOS los ramos con tool activa hoy en WhatsApp
 * (los que tienen defaults en ramo-campos-defaults.ts) de una sola vez — para
 * `AgentToolRulesContext.ramoCampos` (registry.ts), cargado junto a
 * `quotingRules`/`calendarConnection` antes de generar la respuesta, porque
 * `buildPromptBlock` es síncrono y no tiene `db`. Se llama solo cuando
 * `quotingRules.enabled`, igual que `calendarConnection` solo se carga si hay
 * `orgId` — evita queries de sobra cuando el agente no cotiza.
 */
export async function getAllRamoCampoDefinitionsParaCotizar(db: SupabaseClient, organizationId: string): Promise<Record<string, RamoCampoDef[]>> {
  const ramos = Object.keys(DEFAULT_CAMPOS_POR_RAMO);
  const entries = await Promise.all(ramos.map(async ramo => [ramo, await getRamoCampoDefinitionsParaCotizar(db, organizationId, ramo)] as const));
  return Object.fromEntries(entries);
}

/** Campos extra que el corredor configuró para este ramo (poliza_ramo_campos) con el valor ya respondido en datosRiesgo, si lo hay — para que el asesor vea de un vistazo qué preguntó su propio checklist, no solo lo que la IA pidió por defecto. */
async function getRamoCamposConDatos(
  db: SupabaseClient,
  organizationId: string,
  ramo: string,
  datosRiesgo: Record<string, unknown>
): Promise<QuoteRamoCampo[]> {
  const definiciones = await getRamoCampoDefinitions(db, organizationId, ramo);
  return definiciones.map(c => ({ ...c, value: datosRiesgo[c.fieldKey] ?? null }));
}

/** Hoy solo La Equidad tiene código real de cotización automática (createQuotation/getQuotationDetail) — agregar acá al construir el adaptador de la siguiente aseguradora. */
const AUTOMATED_ADAPTERS: Partial<Record<RamoCotizable, Array<"la_equidad">>> = {
  autos: ["la_equidad"]
};

/** ¿Hay una aseguradora ACTIVA que declaró cotizar este ramo y para la que Noova ya tiene un adaptador real? */
async function findAutomatedInsurerForRamo(
  db: SupabaseClient,
  organizationId: string,
  ramo: string
): Promise<boolean> {
  const ramoCotizable = (Object.keys(RAMOS_COTIZABLES) as RamoCotizable[]).includes(ramo as RamoCotizable)
    ? (ramo as RamoCotizable)
    : null;
  if (!ramoCotizable) return false;

  const candidateProviders = AUTOMATED_ADAPTERS[ramoCotizable] ?? [];
  if (candidateProviders.length === 0) return false;

  const connections = await listInsurerConnectionsForOrg(db, organizationId);
  return connections.some(
    c =>
      c.status === "active" &&
      candidateProviders.includes(c.providerKey as "la_equidad") &&
      c.ramos.some(slug => ramoCotizableFromCatalogoSlug(slug) === ramoCotizable)
  );
}

/**
 * Un solo lugar que decide "cuál es el siguiente paso" de una cotización de
 * seguro ligada a un lead — lo usan tanto el panel guiado en la ficha del
 * lead (SeguroQuotePanel.tsx) como la tool de ORI (guiar_cotizacion_seguro),
 * para que ORI y la UI nunca queden desincronizados sobre qué sigue.
 */
export type QuoteGuidanceStep =
  | "sin_cotizacion"
  | "cotizar_automatico"
  | "registrar_manual"
  | "generar_pdf"
  | "cerrada";

export interface QuoteGuidance {
  step: QuoteGuidanceStep;
  message: string;
  quote: QuoteRequestRecord | null;
  ramoCampos: QuoteRamoCampo[];
}

const RAMO_LABEL: Record<string, string> = {
  autos: "auto",
  vida: "vida",
  hogar: "hogar",
  salud: "salud",
  motos: "moto",
  soat: "SOAT",
  accidentes_personales: "accidentes personales"
};

async function buildGuidanceForQuote(
  db: SupabaseClient,
  organizationId: string,
  quote: QuoteRequestRecord
): Promise<QuoteGuidance> {
  const ramoCampos = await getRamoCamposConDatos(db, organizationId, quote.ramo, quote.datosRiesgo);

  if (quote.estado === "cerrada" || quote.estado === "descartada") {
    return {
      step: "cerrada",
      message: "Esta cotización quedó cerrada o descartada — no hay ninguna acción pendiente.",
      quote,
      ramoCampos
    };
  }

  if (quote.estado === "cotizada" || quote.estado === "enviada_externa") {
    return {
      step: "generar_pdf",
      message: `Ya tienes el precio real (${quote.resultado?.aseguradora ?? "aseguradora"}, ${
        quote.resultado?.prima ? `$${quote.resultado.prima.toLocaleString("es-CO")} COP` : "sin prima registrada"
      }). Genera el PDF o el link de la cotización y envíaselo al cliente.`,
      quote,
      ramoCampos
    };
  }

  // estado === "pendiente"
  if (await findAutomatedInsurerForRamo(db, organizationId, quote.ramo)) {
    return {
      step: "cotizar_automatico",
      message: "Ya tienes los datos completos — pide el precio real con un clic.",
      quote,
      ramoCampos
    };
  }

  return {
    step: "registrar_manual",
    message: `Los datos de ${RAMO_LABEL[quote.ramo] ?? quote.ramo} ya están completos, pero no hay ninguna aseguradora conectada para cotizar automático — cotiza por fuera y registra el precio real acá.`,
    quote,
    ramoCampos
  };
}

const SIN_COTIZACION_GUIDANCE: QuoteGuidance = {
  step: "sin_cotizacion",
  message:
    "Este lead todavía no tiene ninguna cotización de seguro iniciada. Empieza la conversación con el cliente para que la IA reúna los datos, o regístrala manualmente.",
  quote: null,
  ramoCampos: []
};

/** Cotización más reciente del lead — usada por la tool de ORI `guiar_cotizacion_seguro`, que no distingue ramo. */
export async function getQuoteGuidanceForLead(
  db: SupabaseClient,
  organizationId: string,
  leadId: string
): Promise<QuoteGuidance> {
  const quote = await getLatestQuoteRequestForLead(db, organizationId, leadId);
  if (!quote) return SIN_COTIZACION_GUIDANCE;
  return buildGuidanceForQuote(db, organizationId, quote);
}

/** Guía de UNA cotización puntual por su id — lo que carga la ficha completa (/dashboard/crm/cotizaciones/[id]). Null si no existe en esta organización. */
export async function getQuoteGuidanceById(
  db: SupabaseClient,
  organizationId: string,
  quoteId: string
): Promise<QuoteGuidance | null> {
  const quote = await getQuoteRequestById(db, organizationId, quoteId);
  if (!quote) return null;
  return buildGuidanceForQuote(db, organizationId, quote);
}

/** Una guía por cada cotización del lead — lo que pinta el panel multi-ramo de la ficha (SeguroQuotePanel.tsx). */
export async function listQuoteGuidanceForLead(
  db: SupabaseClient,
  organizationId: string,
  leadId: string
): Promise<QuoteGuidance[]> {
  const quotes = await listQuoteRequestsForLead(db, organizationId, leadId);
  if (quotes.length === 0) return [SIN_COTIZACION_GUIDANCE];
  return Promise.all(quotes.map(q => buildGuidanceForQuote(db, organizationId, q)));
}
