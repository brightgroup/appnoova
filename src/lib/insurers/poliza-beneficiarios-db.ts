import type { SupabaseClient } from "@supabase/supabase-js";

export interface PolizaBeneficiarioRecord {
  id: string;
  polizaId: string;
  nombre: string;
  documento: string | null;
  parentesco: string | null;
  porcentajeBeneficio: number | null;
  excluido: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PolizaBeneficiarioRow {
  id: string;
  poliza_id: string;
  nombre: string;
  documento: string | null;
  parentesco: string | null;
  porcentaje_beneficio: number | null;
  excluido: boolean;
  created_at: string;
  updated_at: string;
}

function toRecord(row: PolizaBeneficiarioRow): PolizaBeneficiarioRecord {
  return {
    id: row.id,
    polizaId: row.poliza_id,
    nombre: row.nombre,
    documento: row.documento,
    parentesco: row.parentesco,
    porcentajeBeneficio: row.porcentaje_beneficio,
    excluido: row.excluido,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listBeneficiarios(db: SupabaseClient, polizaId: string): Promise<PolizaBeneficiarioRecord[]> {
  const { data } = await db
    .from("poliza_beneficiarios")
    .select("*")
    .eq("poliza_id", polizaId)
    .order("created_at", { ascending: true });
  return ((data as PolizaBeneficiarioRow[] | null) ?? []).map(toRecord);
}

export async function createBeneficiario(
  db: SupabaseClient,
  polizaId: string,
  input: { nombre: string; documento?: string | null; parentesco?: string | null; porcentajeBeneficio?: number | null }
): Promise<PolizaBeneficiarioRecord> {
  const { data, error } = await db
    .from("poliza_beneficiarios")
    .insert({
      poliza_id: polizaId,
      nombre: input.nombre,
      documento: input.documento ?? null,
      parentesco: input.parentesco ?? null,
      porcentaje_beneficio: input.porcentajeBeneficio ?? null
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el beneficiario");
  return toRecord(data as PolizaBeneficiarioRow);
}

export async function updateBeneficiario(
  db: SupabaseClient,
  id: string,
  patch: { nombre?: string; documento?: string | null; parentesco?: string | null; porcentajeBeneficio?: number | null; excluido?: boolean }
): Promise<PolizaBeneficiarioRecord | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.nombre !== undefined) update.nombre = patch.nombre;
  if (patch.documento !== undefined) update.documento = patch.documento;
  if (patch.parentesco !== undefined) update.parentesco = patch.parentesco;
  if (patch.porcentajeBeneficio !== undefined) update.porcentaje_beneficio = patch.porcentajeBeneficio;
  if (patch.excluido !== undefined) update.excluido = patch.excluido;

  const { data, error } = await db.from("poliza_beneficiarios").update(update).eq("id", id).select("*").single();
  if (error || !data) return null;
  return toRecord(data as PolizaBeneficiarioRow);
}

export async function deleteBeneficiario(db: SupabaseClient, id: string): Promise<void> {
  await db.from("poliza_beneficiarios").delete().eq("id", id);
}
