import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataTableColumn } from "@/types/data-table";

/**
 * "Playbook" de siniestros por aseguradora — a dónde reportar, checklist de
 * documentos por ramo, tiempos típicos. Reutiliza el mecanismo genérico de
 * `data_tables` (el mismo que ya usan los agentes para catálogos) en vez de
 * una tabla nueva: el corredor lo edita en /dashboard/tablas, cero UI nueva
 * que mantener. Se identifica por nombre fijo dentro de la organización.
 */
export const SINIESTRO_PLAYBOOK_TABLE_NAME = "Playbook de Siniestros";

const PLAYBOOK_COLUMNS: DataTableColumn[] = [
  { key: "aseguradora", label: "Aseguradora", type: "text", filterable: true, display: true, required: true },
  { key: "ramo", label: "Ramo", type: "text", filterable: true, display: true, required: true },
  { key: "contacto", label: "A dónde reportar", type: "text", filterable: false, display: true, required: false },
  {
    key: "checklist_documentos",
    label: "Documentos requeridos (separados por coma)",
    type: "text",
    filterable: false,
    display: true,
    required: false
  },
  { key: "tiempo_respuesta", label: "Tiempo típico de respuesta", type: "text", filterable: false, display: true, required: false }
];

export interface SiniestroPlaybookEntry {
  aseguradora: string;
  ramo: string;
  contacto: string | null;
  documentos: string[];
  tiempoRespuesta: string | null;
}

/** Crea la tabla vacía (sin filas de ejemplo — el corredor carga sus datos reales) si la organización todavía no la tiene. */
export async function ensureSiniestroPlaybookTable(
  db: SupabaseClient,
  organizationId: string,
  userId: string
): Promise<string> {
  const { data: existing } = await db
    .from("data_tables")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", SINIESTRO_PLAYBOOK_TABLE_NAME)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await db
    .from("data_tables")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      name: SINIESTRO_PLAYBOOK_TABLE_NAME,
      description: "A dónde reportar y qué documentos pedir por aseguradora y ramo — usado por el copiloto de siniestros.",
      columns: PLAYBOOK_COLUMNS,
      row_count: 0
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear la tabla de playbook de siniestros");
  return data.id as string;
}

/** Busca la ficha de una aseguradora+ramo. Si no existe la tabla o la fila, devuelve null — el tool debe manejarlo con honestidad, no inventar el checklist. */
export async function getSiniestroPlaybook(
  db: SupabaseClient,
  organizationId: string,
  aseguradora: string,
  ramo: string
): Promise<SiniestroPlaybookEntry | null> {
  const { data: table } = await db
    .from("data_tables")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", SINIESTRO_PLAYBOOK_TABLE_NAME)
    .maybeSingle();

  if (!table?.id) return null;

  const { data: rows } = await db
    .from("data_table_rows")
    .select("data")
    .eq("data_table_id", table.id)
    .eq("is_active", true);

  const match = (rows ?? []).find(r => {
    const d = r.data as Record<string, unknown>;
    return (
      String(d.aseguradora ?? "").trim().toLowerCase() === aseguradora.trim().toLowerCase() &&
      String(d.ramo ?? "").trim().toLowerCase() === ramo.trim().toLowerCase()
    );
  });

  if (!match) return null;
  const d = match.data as Record<string, unknown>;
  return {
    aseguradora: String(d.aseguradora ?? aseguradora),
    ramo: String(d.ramo ?? ramo),
    contacto: d.contacto ? String(d.contacto) : null,
    documentos: String(d.checklist_documentos ?? "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean),
    tiempoRespuesta: d.tiempo_respuesta ? String(d.tiempo_respuesta) : null
  };
}
