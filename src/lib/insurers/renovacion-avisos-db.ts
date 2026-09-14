import type { SupabaseClient } from "@supabase/supabase-js";

export type RenovacionAvisoEstado = "enviado" | "fallido" | "omitido_optout" | "sin_telefono";

export interface RenovacionAvisoRecord {
  id: string;
  organizationId: string;
  polizaId: string;
  contactId: string | null;
  diasAviso: number;
  phoneE164: string | null;
  estado: RenovacionAvisoEstado;
  error: string | null;
  sentAt: string | null;
  respondioAt: string | null;
  createdAt: string;
}

interface RenovacionAvisoRow {
  id: string;
  organization_id: string;
  poliza_id: string;
  contact_id: string | null;
  dias_aviso: number;
  phone_e164: string | null;
  estado: string;
  error: string | null;
  sent_at: string | null;
  respondio_at: string | null;
  created_at: string;
}

function toRecord(row: RenovacionAvisoRow): RenovacionAvisoRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    polizaId: row.poliza_id,
    contactId: row.contact_id,
    diasAviso: row.dias_aviso,
    phoneE164: row.phone_e164,
    estado: row.estado as RenovacionAvisoEstado,
    error: row.error,
    sentAt: row.sent_at,
    respondioAt: row.respondio_at,
    createdAt: row.created_at
  };
}

/** true si ya existe un aviso (de cualquier resultado) para esa póliza y ese hito — es la idempotencia real, respaldada por el unique(poliza_id, dias_aviso). */
export async function existeAvisoPara(db: SupabaseClient, polizaId: string, diasAviso: number): Promise<boolean> {
  const { data } = await db
    .from("seguros_renovacion_avisos")
    .select("id")
    .eq("poliza_id", polizaId)
    .eq("dias_aviso", diasAviso)
    .maybeSingle();
  return Boolean(data);
}

export async function registrarAviso(
  db: SupabaseClient,
  input: {
    organizationId: string;
    polizaId: string;
    contactId: string | null;
    diasAviso: number;
    phoneE164: string | null;
    estado: RenovacionAvisoEstado;
    error?: string | null;
  }
): Promise<RenovacionAvisoRecord | null> {
  const { data, error } = await db
    .from("seguros_renovacion_avisos")
    .insert({
      organization_id: input.organizationId,
      poliza_id: input.polizaId,
      contact_id: input.contactId,
      dias_aviso: input.diasAviso,
      phone_e164: input.phoneE164,
      estado: input.estado,
      error: input.error ?? null,
      sent_at: input.estado === "enviado" ? new Date().toISOString() : null
    })
    .select("*")
    .single();

  // choque contra el unique(poliza_id, dias_aviso): otra corrida ya lo registró, no es un error real.
  if (error) return null;
  return data ? toRecord(data as RenovacionAvisoRow) : null;
}

export async function listAvisosPorPoliza(db: SupabaseClient, polizaId: string): Promise<RenovacionAvisoRecord[]> {
  const { data } = await db
    .from("seguros_renovacion_avisos")
    .select("*")
    .eq("poliza_id", polizaId)
    .order("dias_aviso", { ascending: false });
  return ((data as RenovacionAvisoRow[] | null) ?? []).map(toRecord);
}

/** Avisos "enviado" sin respuesta registrada todavía, de una organización — el cron los usa para detectar respuesta y, si aplica, decidir el escalamiento. */
export async function listAvisosEnviadosSinRespuesta(
  db: SupabaseClient,
  organizationId: string
): Promise<RenovacionAvisoRecord[]> {
  const { data } = await db
    .from("seguros_renovacion_avisos")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("estado", "enviado")
    .is("respondio_at", null);
  return ((data as RenovacionAvisoRow[] | null) ?? []).map(toRecord);
}

export async function marcarRespuesta(db: SupabaseClient, avisoId: string, respondioAt: string): Promise<void> {
  await db.from("seguros_renovacion_avisos").update({ respondio_at: respondioAt }).eq("id", avisoId);
}
