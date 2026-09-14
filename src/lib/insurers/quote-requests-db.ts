import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutoQuoteVehicle } from "@/lib/insurers/auto-quote-tool";
import { syncQuoteToLeadMetadata, resolveOrCreateInsuranceLead } from "@/lib/crm-insurance-sync";
import { RAMOS_COTIZABLES, type RamoCotizable } from "@/lib/insurers/ramos-cotizables";

/** Nombre legible por ramo, usado tanto en el título del lead como en el campo `ramo` sincronizado al CRM. */
const RAMO_LABELS: Record<string, string> = {
  autos: "Auto",
  vida: "Vida",
  hogar: "Hogar",
  motos: "Moto",
  soat: "SOAT",
  accidentes_personales: "Accidentes Personales"
};

function ramoLabel(ramo: string): string {
  return RAMO_LABELS[ramo] ?? ramo;
}

export type QuoteRequestEstado = "pendiente" | "cotizada" | "enviada_externa" | "cerrada" | "descartada";
export type QuoteRequestSource = "whatsapp" | "web" | "ori" | "manual";

export interface QuoteRequestTomador {
  nombre_tomador?: string;
  documento_tomador?: string;
  fecha_nacimiento_tomador?: string;
  /** Datos personales que ya no son solo de autos/vida — insumo para cualquier ramo genérico (ver poliza_ramo_campos). */
  ocupacion?: string;
  ciudad?: string;
}

export type QuoteResultPeriodicidad = "mensual" | "anual" | "mensual_y_anual" | "pago_unico";

export interface QuoteRequestResultado {
  aseguradora?: string;
  /** Precio mensual, o el único precio cuando periodicidad es "pago_unico". */
  prima?: number | null;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  /** Timestamp de cuando el cliente aceptó desde el link público — ver markQuoteRequestAccepted. */
  aceptada_at?: string | null;
  /** Campos "ficha de cotización" (ver plan "Módulo Cotizaciones en CRM") — mismo shape que arma Figuro en su "Crear cotización", nunca varias opciones dentro de un mismo resultado. */
  nombre_plan?: string;
  /** Texto libre del asesor, se muestra como "Nota" en el link público. */
  descripcion?: string;
  periodicidad?: QuoteResultPeriodicidad;
  prima_anual?: number | null;
  /** "Características del Plan" — checklist corto que ve el cliente. */
  incluye?: string[];
  /** "Beneficios Adicionales" — lista libre, una línea por beneficio. */
  beneficios?: string[];
}

export interface QuoteRequestRecord {
  id: string;
  organizationId: string;
  contactId: string | null;
  leadId: string | null;
  conversationId: string | null;
  source: QuoteRequestSource;
  ramo: string;
  placa: string | null;
  vehiculo: AutoQuoteVehicle | Record<string, unknown>;
  /** Datos del riesgo para ramos sin conector de aseguradora (vida, hogar, etc.) — vehiculo sigue siendo específico de autos. */
  datosRiesgo: Record<string, unknown>;
  tomador: QuoteRequestTomador;
  estado: QuoteRequestEstado;
  resultado: QuoteRequestResultado | null;
  quotedByUserId: string | null;
  externalSource: string | null;
  createdAt: string;
  updatedAt: string;
}

interface QuoteRequestRow {
  id: string;
  organization_id: string;
  contact_id: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  source: string;
  ramo: string;
  placa: string | null;
  vehiculo: Record<string, unknown>;
  datos_riesgo: Record<string, unknown>;
  tomador: Record<string, unknown>;
  estado: string;
  resultado: Record<string, unknown> | null;
  quoted_by_user_id: string | null;
  external_source: string | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: QuoteRequestRow): QuoteRequestRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    contactId: row.contact_id,
    leadId: row.lead_id,
    conversationId: row.conversation_id,
    source: row.source as QuoteRequestSource,
    ramo: row.ramo,
    placa: row.placa,
    vehiculo: row.vehiculo ?? {},
    datosRiesgo: row.datos_riesgo ?? {},
    tomador: (row.tomador ?? {}) as QuoteRequestTomador,
    estado: row.estado as QuoteRequestEstado,
    resultado: row.resultado as QuoteRequestResultado | null,
    quotedByUserId: row.quoted_by_user_id,
    externalSource: row.external_source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Crea la solicitud si no existe una pendiente para la misma placa+conversación,
 * o actualiza la que ya está abierta — evita duplicar filas cada vez que la IA
 * vuelve a llamar la tool de calificación dentro de la misma conversación.
 */
export async function upsertPendingQuoteRequest(
  db: SupabaseClient,
  params: {
    organizationId: string;
    conversationId?: string | null;
    contactId?: string | null;
    leadId?: string | null;
    /** Si no hay leadId, se usa para encontrar/crear el lead de CRM del cliente (ver resolveOrCreateInsuranceLead). */
    contactE164?: string | null;
    source: QuoteRequestSource;
    ramo?: string;
    /** Solo aplica a autos — otros ramos no tienen placa. */
    placa?: string | null;
    vehiculo?: Record<string, unknown>;
    /** Datos del riesgo para ramos sin placa/vehículo (vida, hogar, etc.). */
    datosRiesgo?: Record<string, unknown>;
    tomador: QuoteRequestTomador;
  }
): Promise<QuoteRequestRecord> {
  const ramo = params.ramo ?? "autos";

  let leadId = params.leadId ?? null;
  let contactId = params.contactId ?? null;
  if (!leadId && params.contactE164) {
    const titulo = params.placa
      ? `Seguro de ${ramoLabel(ramo)} — ${params.placa}`
      : `Seguro de ${ramoLabel(ramo)} — ${params.tomador.nombre_tomador ?? "sin nombre"}`;
    const resolved = await resolveOrCreateInsuranceLead(db, params.organizationId, {
      contactE164: params.contactE164,
      nombreTomador: params.tomador.nombre_tomador,
      titulo
    });
    if (resolved) {
      leadId = resolved.leadId;
      contactId = contactId ?? resolved.contactId;
    }
  }

  let existingId: string | null = null;
  if (params.conversationId) {
    let query = db
      .from("insurance_quote_requests")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("conversation_id", params.conversationId)
      .eq("ramo", ramo)
      .eq("estado", "pendiente");
    query = params.placa ? query.eq("placa", params.placa) : query.is("placa", null);
    const { data } = await query.maybeSingle();
    existingId = data?.id ?? null;
  }

  const payload = {
    organization_id: params.organizationId,
    contact_id: contactId,
    lead_id: leadId,
    conversation_id: params.conversationId ?? null,
    source: params.source,
    ramo,
    placa: params.placa ?? null,
    vehiculo: params.vehiculo ?? {},
    datos_riesgo: params.datosRiesgo ?? {},
    tomador: params.tomador,
    estado: "pendiente" as const,
    updated_at: new Date().toISOString()
  };

  const { data, error } = existingId
    ? await db.from("insurance_quote_requests").update(payload).eq("id", existingId).select("*").single()
    : await db.from("insurance_quote_requests").insert(payload).select("*").single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo guardar la solicitud de cotización");

  const vehiculo = params.vehiculo ?? {};
  const strOrNull = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));
  const numOrNull = (v: unknown) => (typeof v === "number" ? v : null);
  // El slug del catálogo (no la etiqueta capitalizada de antes) — así el campo
  // "Ramo" del lead (que ahora lista ramos_catalogo completo) reconoce el
  // valor y muestra su ícono, en vez de quedar como texto plano sin match.
  const ramoSlug = RAMOS_COTIZABLES[ramo as RamoCotizable]?.catalogoSlug ?? ramo;
  await syncQuoteToLeadMetadata(db, leadId, {
    placa: params.placa ?? null,
    ramo: ramoSlug,
    vehiculo_marca: strOrNull(vehiculo.marca),
    vehiculo_linea: strOrNull(vehiculo.linea),
    vehiculo_modelo: numOrNull(vehiculo.modelo),
    vehiculo_valor_comercial: numOrNull(vehiculo.valor_comercial),
    vehiculo_codigo_fasecolda: strOrNull(vehiculo.codigo_fasecolda),
    vehiculo_categoria: strOrNull(vehiculo.categoria),
    vehiculo_combustible: strOrNull(vehiculo.combustible)
  });

  return toRecord(data as QuoteRequestRow);
}

export async function listQuoteRequests(
  db: SupabaseClient,
  organizationId: string,
  filter?: { estado?: QuoteRequestEstado }
): Promise<QuoteRequestRecord[]> {
  let query = db
    .from("insurance_quote_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (filter?.estado) query = query.eq("estado", filter.estado);

  const { data } = await query;
  return ((data as QuoteRequestRow[] | null) ?? []).map(toRecord);
}

/** Usado por el webhook de fuentes externas (ej. Agentemotor) cuando no traen el id exacto — empareja por placa + documento sobre la más reciente pendiente. */
export async function findPendingQuoteRequestByPlaca(
  db: SupabaseClient,
  organizationId: string,
  placa: string,
  documentoTomador?: string | null
): Promise<QuoteRequestRecord | null> {
  const { data } = await db
    .from("insurance_quote_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("estado", "pendiente")
    .eq("placa", placa)
    .order("created_at", { ascending: false })
    .limit(1);
  const rows = (data as QuoteRequestRow[] | null) ?? [];
  if (!rows.length) return null;
  if (documentoTomador && rows[0].tomador?.documento_tomador !== documentoTomador) return null;
  return toRecord(rows[0]);
}

/** Cotización más reciente ligada a un lead — usada por la tool de ORI `guiar_cotizacion_seguro` (solo recibe el lead, no distingue ramo). */
export async function getLatestQuoteRequestForLead(
  db: SupabaseClient,
  organizationId: string,
  leadId: string
): Promise<QuoteRequestRecord | null> {
  const { data } = await db
    .from("insurance_quote_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRecord(data as QuoteRequestRow) : null;
}

/** TODAS las cotizaciones de un lead (no solo la última) — un lead puede tener una de autos y otra de salud a la vez, cada una su propia tarjeta en el panel. */
export async function listQuoteRequestsForLead(
  db: SupabaseClient,
  organizationId: string,
  leadId: string
): Promise<QuoteRequestRecord[]> {
  const { data } = await db
    .from("insurance_quote_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  return ((data as QuoteRequestRow[] | null) ?? []).map(toRecord);
}

/** Crea una cotización vacía para un ramo específico de un lead — usada por "+ Nueva cotización" en el panel y por el tool genérico iniciar_cotizacion_seguro. */
export async function createQuoteRequestForLead(
  db: SupabaseClient,
  organizationId: string,
  params: { leadId: string; contactId?: string | null; ramo: string; source: QuoteRequestSource; conversationId?: string | null }
): Promise<QuoteRequestRecord> {
  const { data, error } = await db
    .from("insurance_quote_requests")
    .insert({
      organization_id: organizationId,
      contact_id: params.contactId ?? null,
      lead_id: params.leadId,
      conversation_id: params.conversationId ?? null,
      source: params.source,
      ramo: params.ramo,
      vehiculo: {},
      datos_riesgo: {},
      tomador: {},
      estado: "pendiente" as const
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear la cotización");
  return toRecord(data as QuoteRequestRow);
}

/** Guarda respuestas nuevas de datos_riesgo/tomador SIN pisar lo que ya había — mismo insumo sin importar si lo escribió un asesor a mano o lo capturó la IA por WhatsApp. */
export async function updateQuoteRequestDatos(
  db: SupabaseClient,
  organizationId: string,
  id: string,
  params: { datosRiesgo?: Record<string, unknown>; tomador?: Partial<QuoteRequestTomador> }
): Promise<QuoteRequestRecord | null> {
  const existing = await getQuoteRequestById(db, organizationId, id);
  if (!existing) return null;

  const { data, error } = await db
    .from("insurance_quote_requests")
    .update({
      datos_riesgo: { ...existing.datosRiesgo, ...(params.datosRiesgo ?? {}) },
      tomador: { ...existing.tomador, ...(params.tomador ?? {}) },
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo guardar la respuesta");
  return toRecord(data as QuoteRequestRow);
}

export async function getQuoteRequestById(
  db: SupabaseClient,
  organizationId: string,
  id: string
): Promise<QuoteRequestRecord | null> {
  const { data } = await db
    .from("insurance_quote_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  return data ? toRecord(data as QuoteRequestRow) : null;
}

export async function markQuoteRequestQuoted(
  db: SupabaseClient,
  id: string,
  params: { resultado: QuoteRequestResultado; quotedByUserId?: string | null; externalSource?: string | null }
): Promise<void> {
  const { data } = await db
    .from("insurance_quote_requests")
    .update({
      estado: params.externalSource ? "enviada_externa" : "cotizada",
      resultado: params.resultado,
      quoted_by_user_id: params.quotedByUserId ?? null,
      external_source: params.externalSource ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("lead_id")
    .maybeSingle();

  await syncQuoteToLeadMetadata(db, data?.lead_id as string | null | undefined, {
    aseguradora_cotizada: params.resultado.aseguradora ?? null,
    prima_cotizada: params.resultado.prima ?? null,
    vigencia_desde: params.resultado.vigencia_desde ?? null,
    vigencia_hasta: params.resultado.vigencia_hasta ?? null
  });
}

/** Genera el token público si todavía no existe (nunca se reparte por default de columna — ver migración 140) y lo devuelve. */
export async function ensureQuoteRequestPublicToken(
  db: SupabaseClient,
  organizationId: string,
  id: string
): Promise<string | null> {
  const { data: existing } = await db
    .from("insurance_quote_requests")
    .select("public_token")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (!existing) return null;
  if (existing.public_token) return existing.public_token as string;

  const { data, error } = await db
    .from("insurance_quote_requests")
    .update({ public_token: crypto.randomUUID().replace(/-/g, "") })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("public_token")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo generar el link público");
  return data.public_token as string;
}

/** Sin filtro de organización a propósito — el token ES la autenticación (mismo patrón que external_quote_sources). */
export async function getQuoteRequestByPublicToken(
  db: SupabaseClient,
  token: string
): Promise<QuoteRequestRecord | null> {
  const { data } = await db.from("insurance_quote_requests").select("*").eq("public_token", token).maybeSingle();
  return data ? toRecord(data as QuoteRequestRow) : null;
}

/**
 * El cliente aceptó la cotización desde el link público — se guarda dentro
 * de `resultado` (sin migración nueva) en vez de un estado aparte, porque no
 * mueve el pipeline por su cuenta; eso lo sigue decidiendo el asesor.
 */
export async function markQuoteRequestAccepted(db: SupabaseClient, id: string): Promise<QuoteRequestRecord | null> {
  const { data: current } = await db.from("insurance_quote_requests").select("resultado").eq("id", id).maybeSingle();
  if (!current) return null;

  const resultado = { ...(current.resultado ?? {}), aceptada_at: new Date().toISOString() };
  const { data: updated } = await db
    .from("insurance_quote_requests")
    .update({ resultado, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  return updated ? toRecord(updated as QuoteRequestRow) : null;
}

export async function updateQuoteRequestEstado(
  db: SupabaseClient,
  organizationId: string,
  id: string,
  estado: QuoteRequestEstado
): Promise<void> {
  await db
    .from("insurance_quote_requests")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id);
}
