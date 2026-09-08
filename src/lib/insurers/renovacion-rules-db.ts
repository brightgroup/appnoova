import type { SupabaseClient } from "@supabase/supabase-js";

export interface RenovacionRule {
  organizationId: string;
  enabled: boolean;
  horaEnvio: number;
  diasAviso: number[];
  whatsappChannelId: string | null;
  templateId: string | null;
  escalarALlamada: boolean;
  updatedAt: string;
}

interface RenovacionRuleRow {
  organization_id: string;
  enabled: boolean;
  hora_envio: number;
  dias_aviso: number[] | null;
  whatsapp_channel_id: string | null;
  template_id: string | null;
  escalar_a_llamada: boolean;
  updated_at: string;
}

function toRuleRecord(row: RenovacionRuleRow): RenovacionRule {
  return {
    organizationId: row.organization_id,
    enabled: row.enabled,
    horaEnvio: row.hora_envio,
    diasAviso: Array.isArray(row.dias_aviso) && row.dias_aviso.length > 0 ? row.dias_aviso : [30, 15, 5],
    whatsappChannelId: row.whatsapp_channel_id,
    templateId: row.template_id,
    escalarALlamada: row.escalar_a_llamada,
    updatedAt: row.updated_at
  };
}

/** Apagada por defecto: sin canal ni plantilla elegidos, el cron no tiene con qué enviar nada. */
export function defaultRenovacionRule(organizationId: string): RenovacionRule {
  return {
    organizationId,
    enabled: false,
    horaEnvio: 9,
    diasAviso: [30, 15, 5],
    whatsappChannelId: null,
    templateId: null,
    escalarALlamada: false,
    updatedAt: new Date(0).toISOString()
  };
}

export async function getRenovacionRule(db: SupabaseClient, organizationId: string): Promise<RenovacionRule> {
  const { data, error } = await db
    .from("seguros_renovacion_rules")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRuleRecord(data as RenovacionRuleRow) : defaultRenovacionRule(organizationId);
}

/** Reglas activas cuya hora de envío coincide con la hora dada (Bogotá) — lo que el cron necesita por corrida. */
export async function listRenovacionRulesPorHora(db: SupabaseClient, hora: number): Promise<RenovacionRule[]> {
  const { data } = await db
    .from("seguros_renovacion_rules")
    .select("*")
    .eq("enabled", true)
    .eq("hora_envio", hora);
  return ((data as RenovacionRuleRow[] | null) ?? []).map(toRuleRecord);
}

export interface RenovacionRulePatch {
  enabled?: boolean;
  horaEnvio?: number;
  diasAviso?: number[];
  whatsappChannelId?: string | null;
  templateId?: string | null;
  escalarALlamada?: boolean;
}

export async function upsertRenovacionRule(
  db: SupabaseClient,
  organizationId: string,
  patch: RenovacionRulePatch
): Promise<RenovacionRule> {
  const current = await getRenovacionRule(db, organizationId);
  const merged = {
    organization_id: organizationId,
    enabled: patch.enabled ?? current.enabled,
    hora_envio: patch.horaEnvio ?? current.horaEnvio,
    dias_aviso: patch.diasAviso ?? current.diasAviso,
    whatsapp_channel_id: patch.whatsappChannelId !== undefined ? patch.whatsappChannelId : current.whatsappChannelId,
    template_id: patch.templateId !== undefined ? patch.templateId : current.templateId,
    escalar_a_llamada: patch.escalarALlamada ?? current.escalarALlamada,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await db
    .from("seguros_renovacion_rules")
    .upsert(merged, { onConflict: "organization_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toRuleRecord(data as RenovacionRuleRow);
}
