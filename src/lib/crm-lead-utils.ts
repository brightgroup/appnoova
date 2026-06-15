import type {
  CrmLead,
  CrmLeadOutcome,
  CrmLeadTemperatura,
  CrmMotivoPerdida
} from "@/types/crm";

export const CRM_MOTIVO_PERDIDA_LABELS: Record<CrmMotivoPerdida, string> = {
  precio: "Precio",
  no_respondio: "No respondió",
  compro_otro: "Compró con otro",
  no_era_momento: "No era el momento",
  sin_presupuesto: "Sin presupuesto",
  datos_incompletos: "Datos incompletos",
  otro: "Otro"
};

export const CRM_TEMPERATURA_LABELS: Record<CrmLeadTemperatura, string> = {
  frio: "Frío",
  tibio: "Tibio",
  caliente: "Caliente"
};

export function scoreToTemperatura(score: number | null | undefined): CrmLeadTemperatura | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 70) return "caliente";
  if (score >= 40) return "tibio";
  return "frio";
}

export function computeDiasEnEtapa(stageEnteredAt: string | null | undefined): number {
  if (!stageEnteredAt) return 0;
  const entered = new Date(stageEnteredAt).getTime();
  if (Number.isNaN(entered)) return 0;
  return Math.max(0, Math.floor((Date.now() - entered) / (1000 * 60 * 60 * 24)));
}

export function enrichCrmLead(lead: CrmLead): CrmLead {
  const dias_en_etapa = computeDiasEnEtapa(lead.stage_entered_at);
  const temperatura = lead.temperatura ?? scoreToTemperatura(lead.score) ?? null;

  return {
    ...lead,
    dias_en_etapa,
    temperatura
  };
}

export function validateLeadPayload(input: {
  outcome?: CrmLeadOutcome;
  contact_id?: string | null;
  motivo_perdida?: CrmMotivoPerdida | null;
  isCreate?: boolean;
}): string | null {
  if (!input.contact_id) {
    return "Selecciona un contacto para el lead";
  }
  const outcome = input.outcome ?? "open";
  if (outcome === "lost" && !input.motivo_perdida) {
    return "Indica el motivo de pérdida";
  }
  return null;
}

export function leadFromContactDefaults(contact: {
  id: string;
  name: string;
  categorias_interes?: string[];
  fuente_origen?: string | null;
  source?: string | null;
  asesor_asignado?: string | null;
  inbox_conversation_id?: string | null;
}): Partial<CrmLead> {
  return {
    contact_id: contact.id,
    title: `Oportunidad — ${contact.name}`,
    categoria_interes: contact.categorias_interes?.[0] ?? null,
    source: contact.fuente_origen ?? contact.source ?? null,
    asesor_responsable: contact.asesor_asignado ?? null,
    inbox_conversation_id: contact.inbox_conversation_id ?? null,
    outcome: "open"
  };
}
