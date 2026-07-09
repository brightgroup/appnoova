"use client";

import Link from "next/link";
import {
  CRM_LEAD_OUTCOME_LABELS,
  crmOutcomeBadgeVariant,
  crmTemperaturaBadgeVariant,
  filterPipelineStages,
  formatLeadValue
} from "@/lib/crm-record";
import { Badge } from "@/components/ui/Badge";
import {
  CRM_MOTIVO_PERDIDA_LABELS,
  CRM_TEMPERATURA_LABELS
} from "@/lib/crm-lead-utils";
import { FUENTE_ORIGEN_OPTIONS } from "@/lib/crm-contactability";
import { CrmOriQuotePanel } from "@/components/crm/CrmOriQuotePanel";
import { CrmFieldProvenanceBadge } from "@/components/crm/CrmFieldProvenanceBadge";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnGhost } from "@/lib/brand-ui";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { CrmFieldInput, formatCrmDateTime } from "@/components/crm/CrmFieldInput";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import type {
  CrmContact,
  CrmLead,
  CrmLeadOutcome,
  CrmLeadTemperatura,
  CrmMotivoPerdida,
  CrmPipelineStage,
  CrmPropertyDefinition
} from "@/types/crm";

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

interface CrmLeadFormProps {
  draft: Partial<CrmLead>;
  stages: CrmPipelineStage[];
  contacts: CrmContact[];
  properties: CrmPropertyDefinition[];
  leadId?: string;
  onChange: (patch: Partial<CrmLead>) => void;
  onMetaChange: (key: string, value: string | number | boolean | null) => void;
  onLeadSynced?: (lead: CrmLead) => void;
  createdAt?: string;
  updatedAt?: string;
}

export function CrmLeadForm({
  draft,
  stages,
  contacts,
  properties,
  leadId,
  onChange,
  onMetaChange,
  onLeadSynced,
  createdAt,
  updatedAt
}: CrmLeadFormProps) {
  const pipelineStages = filterPipelineStages(stages);
  const outcome = (draft.outcome ?? "open") as CrmLeadOutcome;
  const stage = pipelineStages.find(s => s.id === draft.stage_id);
  const contact = contacts.find(c => c.id === draft.contact_id);
  const inboxId = draft.inbox_conversation_id ?? contact?.inbox_conversation_id;
  const quoteEndpoint = leadId
    ? `/api/crm/leads/${leadId}/quote`
    : draft.contact_id
      ? `/api/crm/contacts/${draft.contact_id}/quote`
      : null;
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const prov = draft.field_provenance ?? {};

  const syncFromConversation = async () => {
    if (!draft.contact_id) return;
    setSyncing(true);
    setSyncMsg("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/crm/contacts/${draft.contact_id}/lead-analyze`, {
        method: "POST",
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg(data.error || "No se pudo analizar");
        return;
      }
      if (data.lead) {
        onLeadSynced?.(data.lead);
        setSyncMsg(
          data.created
            ? "Lead creado y analizado por IA"
            : data.updated?.length
              ? `Actualizado: ${data.updated.join(", ")}`
              : "Sin cambios en esta conversación"
        );
      } else {
        setSyncMsg("Sin oportunidad detectada aún");
      }
    } catch {
      setSyncMsg("Error de red");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      {draft.contact_id && quoteEndpoint && (
        <FieldGroup title="ORI — Asistente de cotización">
          <CrmOriQuotePanel
            quoteEndpoint={quoteEndpoint}
            inboxConversationId={inboxId}
            description="ORI redacta la cotización con el contexto del contacto y esta oportunidad."
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {inboxId && (
              <>
                <button
                  type="button"
                  onClick={syncFromConversation}
                  disabled={syncing}
                  className={btnGhost}
                >
                  {syncing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Sincronizar pipeline con IA"
                  )}
                </button>
                <Link
                  href={`/dashboard/inbox?id=${inboxId}`}
                  className="rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-1.5 text-xs text-[#a5a5ff] hover:bg-white/[.08]"
                >
                  Abrir inbox →
                </Link>
              </>
            )}
            <Link
              href={`/dashboard/crm/contactos/${draft.contact_id}`}
              className="rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-1.5 text-xs text-[#a5a5ff] hover:bg-white/[.08]"
            >
              Ver contacto →
            </Link>
          </div>
          {syncMsg && <p className="text-xs text-gray-400">{syncMsg}</p>}
        </FieldGroup>
      )}

      <FieldGroup title="Oportunidad">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-400 mb-1 block">Título</label>
            <input
              value={draft.title ?? ""}
              onChange={e => onChange({ title: e.target.value })}
              className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
            />
            <CrmFieldProvenanceBadge provenance={prov.title} />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Categoría de interés</label>
            <input
              value={draft.categoria_interes ?? ""}
              onChange={e => onChange({ categoria_interes: e.target.value || null })}
              placeholder="Ej. Autos, Salud…"
              className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
            />
            <CrmFieldProvenanceBadge provenance={prov.categoria_interes} />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Producto de interés</label>
            <input
              value={draft.producto_interes ?? ""}
              onChange={e => onChange({ producto_interes: e.target.value || null })}
              className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
            />
            <CrmFieldProvenanceBadge provenance={prov.producto_interes} />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Valor estimado</label>
            <input
              type="number"
              min="0"
              value={draft.value_amount ?? ""}
              onChange={e =>
                onChange({ value_amount: e.target.value ? Number(e.target.value) : null })
              }
              className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Moneda</label>
            <NoovaSelect
              value={draft.currency ?? "COP"}
              onChange={v => onChange({ currency: v })}
              allowEmpty={false}
              options={[
                { value: "COP", label: "COP" },
                { value: "USD", label: "USD" },
                { value: "EUR", label: "EUR" }
              ]}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Score (0–100)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={draft.score ?? ""}
              onChange={e => {
                const score = e.target.value ? Number(e.target.value) : null;
                onChange({ score });
              }}
              className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Temperatura</label>
            <NoovaSelect
              value={draft.temperatura ?? ""}
              onChange={v => onChange({ temperatura: (v || null) as CrmLeadTemperatura | null })}
              allowEmpty
              emptyLabel="Auto (por score)"
              options={(
                Object.keys(CRM_TEMPERATURA_LABELS) as CrmLeadTemperatura[]
              ).map(k => ({ value: k, label: CRM_TEMPERATURA_LABELS[k] }))}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant={crmOutcomeBadgeVariant(outcome)} uppercase>
            {CRM_LEAD_OUTCOME_LABELS[outcome]}
          </Badge>
          {stage && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
              {stage.name}
              {draft.dias_en_etapa != null && draft.dias_en_etapa > 0 && (
                <span className="text-gray-500">· {draft.dias_en_etapa}d en etapa</span>
              )}
            </span>
          )}
          {draft.temperatura && (
            <Badge variant={crmTemperaturaBadgeVariant(draft.temperatura)}>
              {CRM_TEMPERATURA_LABELS[draft.temperatura]}
            </Badge>
          )}
          <span className="text-[#a5a5ff] font-semibold tabular-nums ml-auto text-sm">
            {formatLeadValue(draft.value_amount ?? null, draft.currency ?? "COP")}
          </span>
        </div>
      </FieldGroup>

      <FieldGroup title="Pipeline">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Etapa</label>
            <NoovaSelect
              value={draft.stage_id ?? ""}
              onChange={v => onChange({ stage_id: v })}
              allowEmpty={false}
              options={pipelineStages.map(s => ({ value: s.id, label: s.name }))}
            />
            <CrmFieldProvenanceBadge provenance={prov.stage_id} />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Resultado</label>
            <NoovaSelect
              value={outcome}
              onChange={v => onChange({ outcome: v as CrmLeadOutcome })}
              allowEmpty={false}
              options={(Object.keys(CRM_LEAD_OUTCOME_LABELS) as CrmLeadOutcome[]).map(k => ({
                value: k,
                label: CRM_LEAD_OUTCOME_LABELS[k]
              }))}
            />
          </div>
          {outcome === "lost" && (
            <>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Motivo de pérdida</label>
                <NoovaSelect
                  value={draft.motivo_perdida ?? ""}
                  onChange={v => onChange({ motivo_perdida: (v || null) as CrmMotivoPerdida | null })}
                  allowEmpty
                  emptyLabel="Seleccionar…"
                  options={(
                    Object.keys(CRM_MOTIVO_PERDIDA_LABELS) as CrmMotivoPerdida[]
                  ).map(k => ({ value: k, label: CRM_MOTIVO_PERDIDA_LABELS[k] }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Detalle</label>
                <input
                  value={draft.motivo_perdida_detalle ?? ""}
                  onChange={e => onChange({ motivo_perdida_detalle: e.target.value || null })}
                  className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
                />
              </div>
            </>
          )}
        </div>
      </FieldGroup>

      <FieldGroup title="Contacto">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-400 mb-1 block">Contacto asociado *</label>
            <NoovaSelect
              value={draft.contact_id ?? ""}
              onChange={v => onChange({ contact_id: v || undefined })}
              allowEmpty
              emptyLabel="Seleccionar contacto…"
              options={contacts.map(c => ({
                value: c.id,
                label: `${c.name}${c.whatsapp ? ` · ${c.whatsapp}` : c.phone ? ` · ${c.phone}` : ""}`
              }))}
            />
          </div>
        </div>
      </FieldGroup>

      <FieldGroup title="Asignación">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Asesor responsable</label>
            <input
              value={draft.asesor_responsable ?? ""}
              onChange={e => onChange({ asesor_responsable: e.target.value || null })}
              placeholder="Nombre del asesor"
              className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Fuente de origen</label>
            <NoovaSelect
              value={draft.source ?? ""}
              onChange={v => onChange({ source: v || null })}
              allowEmpty
              emptyLabel="Sin fuente"
              options={FUENTE_ORIGEN_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            />
          </div>
          <div className="sm:col-span-2">
            <CrmFieldInput
              definition={{
                field_key: "notes",
                label: "Notas",
                field_type: "textarea",
                options: [],
                is_required: false
              }}
              value={draft.notes}
              onChange={v => onChange({ notes: v == null ? null : String(v) })}
            />
          </div>
        </div>
      </FieldGroup>

      {properties.length > 0 && (
        <FieldGroup title="Propiedades adicionales">
          <div className="grid sm:grid-cols-2 gap-3">
            {properties.map(prop => (
              <div key={prop.id} className={prop.field_type === "textarea" ? "sm:col-span-2" : ""}>
                <CrmFieldInput
                  definition={prop}
                  value={draft.metadata?.[prop.field_key]}
                  onChange={v => onMetaChange(prop.field_key, v)}
                />
              </div>
            ))}
          </div>
        </FieldGroup>
      )}

      {createdAt && updatedAt && (
        <div className="flex justify-between text-xs text-gray-500 pt-4 border-t border-white/[.06]">
          <span>Creado {formatCrmDateTime(createdAt)}</span>
          <span>Actualizado {formatCrmDateTime(updatedAt)}</span>
        </div>
      )}
    </>
  );
}
