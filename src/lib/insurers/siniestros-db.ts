import type { SupabaseClient } from "@supabase/supabase-js";

export type SiniestroEstado =
  | "reportado"
  | "documentos_pendientes"
  | "en_forma"
  | "radicado"
  | "pagado"
  | "rechazado"
  | "cerrado";

export interface SiniestroChecklistItem {
  documento: string;
  recibido: boolean;
}

export interface SiniestroRecord {
  id: string;
  organizationId: string;
  contactId: string | null;
  polizaId: string | null;
  conversationId: string | null;
  source: string;
  aseguradora: string;
  ramo: string;
  descripcion: string | null;
  fechaOcurrencia: string | null;
  fechaAviso: string;
  amparoAfectado: string | null;
  checklistDocumentos: SiniestroChecklistItem[];
  estado: SiniestroEstado;
  createdAt: string;
  updatedAt: string;
}

interface SiniestroRow {
  id: string;
  organization_id: string;
  contact_id: string | null;
  poliza_id: string | null;
  conversation_id: string | null;
  source: string;
  aseguradora: string;
  ramo: string;
  descripcion: string | null;
  fecha_ocurrencia: string | null;
  fecha_aviso: string;
  amparo_afectado: string | null;
  checklist_documentos: SiniestroChecklistItem[];
  estado: string;
  created_at: string;
  updated_at: string;
}

function toRecord(row: SiniestroRow): SiniestroRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    contactId: row.contact_id,
    polizaId: row.poliza_id,
    conversationId: row.conversation_id,
    source: row.source,
    aseguradora: row.aseguradora,
    ramo: row.ramo,
    descripcion: row.descripcion,
    fechaOcurrencia: row.fecha_ocurrencia,
    fechaAviso: row.fecha_aviso,
    amparoAfectado: row.amparo_afectado,
    checklistDocumentos: Array.isArray(row.checklist_documentos) ? row.checklist_documentos : [],
    estado: row.estado as SiniestroEstado,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** Deriva el estado inicial del checklist: nada recibido todavía — la IA lo arma completo desde el primer mensaje, el cliente va marcando qué manda. */
function initialChecklist(documentos: string[]): SiniestroChecklistItem[] {
  return documentos.map(documento => ({ documento, recibido: false }));
}

export async function createSiniestro(
  db: SupabaseClient,
  params: {
    organizationId: string;
    conversationId?: string | null;
    contactId?: string | null;
    polizaId?: string | null;
    source: "whatsapp" | "web" | "ori" | "manual";
    aseguradora: string;
    ramo: string;
    descripcion?: string | null;
    fechaOcurrencia?: string | null;
    checklistDocumentos: string[];
  }
): Promise<SiniestroRecord> {
  const { data, error } = await db
    .from("siniestros")
    .insert({
      organization_id: params.organizationId,
      conversation_id: params.conversationId ?? null,
      contact_id: params.contactId ?? null,
      poliza_id: params.polizaId ?? null,
      source: params.source,
      aseguradora: params.aseguradora,
      ramo: params.ramo,
      descripcion: params.descripcion ?? null,
      fecha_ocurrencia: params.fechaOcurrencia ?? null,
      checklist_documentos: initialChecklist(params.checklistDocumentos),
      estado: params.checklistDocumentos.length > 0 ? "documentos_pendientes" : "reportado"
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el siniestro");
  return toRecord(data as SiniestroRow);
}

export async function listSiniestros(
  db: SupabaseClient,
  organizationId: string,
  filter?: { estado?: SiniestroEstado }
): Promise<SiniestroRecord[]> {
  let query = db
    .from("siniestros")
    .select("*")
    .eq("organization_id", organizationId)
    .order("fecha_aviso", { ascending: false });

  if (filter?.estado) query = query.eq("estado", filter.estado);

  const { data } = await query;
  return ((data as SiniestroRow[] | null) ?? []).map(toRecord);
}

export async function getSiniestroById(
  db: SupabaseClient,
  organizationId: string,
  id: string
): Promise<SiniestroRecord | null> {
  const { data } = await db
    .from("siniestros")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  return data ? toRecord(data as SiniestroRow) : null;
}

export async function updateSiniestroChecklistItem(
  db: SupabaseClient,
  organizationId: string,
  id: string,
  documento: string,
  recibido: boolean
): Promise<SiniestroRecord | null> {
  const current = await getSiniestroById(db, organizationId, id);
  if (!current) return null;

  const checklist = current.checklistDocumentos.map(item =>
    item.documento === documento ? { ...item, recibido } : item
  );
  const enForma = checklist.length > 0 && checklist.every(item => item.recibido);

  const { data, error } = await db
    .from("siniestros")
    .update({
      checklist_documentos: checklist,
      estado: enForma ? "en_forma" : "documentos_pendientes",
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) return null;
  return toRecord(data as SiniestroRow);
}

export async function updateSiniestroEstado(
  db: SupabaseClient,
  organizationId: string,
  id: string,
  estado: SiniestroEstado
): Promise<void> {
  await db
    .from("siniestros")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id);
}
