"use client";

import Link from "next/link";
import {
  CRM_LEAD_OUTCOME_LABELS,
  filterPipelineStages,
  formatLeadValue
} from "@/lib/crm-record";
import { CrmFieldInput, formatCrmDateTime } from "@/components/crm/CrmFieldInput";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import type { CrmContact, CrmLead, CrmLeadOutcome, CrmPipelineStage, CrmPropertyDefinition } from "@/types/crm";

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

function outcomeBadgeClass(outcome: CrmLeadOutcome): string {
  if (outcome === "won") return "bg-emerald-500/15 text-emerald-300";
  if (outcome === "lost") return "bg-gray-500/15 text-gray-400";
  return "bg-[#5b5bf6]/15 text-[#a5a5ff]";
}

interface CrmLeadFormProps {
  draft: Partial<CrmLead>;
  stages: CrmPipelineStage[];
  contacts: CrmContact[];
  properties: CrmPropertyDefinition[];
  onChange: (patch: Partial<CrmLead>) => void;
  onMetaChange: (key: string, value: string | number | boolean | null) => void;
  createdAt?: string;
  updatedAt?: string;
}

export function CrmLeadForm({
  draft,
  stages,
  contacts,
  properties,
  onChange,
  onMetaChange,
  createdAt,
  updatedAt
}: CrmLeadFormProps) {
  const pipelineStages = filterPipelineStages(stages);
  const outcome = (draft.outcome ?? "open") as CrmLeadOutcome;
  const stage = pipelineStages.find(s => s.id === draft.stage_id);

  return (
    <>
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
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Valor</label>
            <input
              type="number"
              min="0"
              value={draft.value_amount ?? ""}
              onChange={e => onChange({
                value_amount: e.target.value ? Number(e.target.value) : null
              })}
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
        </div>
        <div className="flex items-center gap-2 text-sm pt-1">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${outcomeBadgeClass(outcome)}`}>
            {CRM_LEAD_OUTCOME_LABELS[outcome]}
          </span>
          {stage && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
              {stage.name}
            </span>
          )}
          <span className="text-[#a5a5ff] font-semibold tabular-nums ml-auto">
            {formatLeadValue(draft.value_amount ?? null, draft.currency ?? "COP")}
          </span>
        </div>
      </FieldGroup>

      <FieldGroup title="Detalle">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-400 mb-1 block">Título</label>
            <input
              value={draft.title ?? ""}
              onChange={e => onChange({ title: e.target.value })}
              className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-400 mb-1 block">Contacto</label>
            <NoovaSelect
              value={draft.contact_id ?? ""}
              onChange={v => onChange({ contact_id: v || null })}
              allowEmpty={true}
              emptyLabel="Sin contacto"
              options={contacts.map(c => ({
                value: c.id,
                label: `${c.name}${c.phone ? ` · ${c.phone}` : ""}`
              }))}
            />
          </div>
          <CrmFieldInput
            definition={{ field_key: "source", label: "Origen", field_type: "text", options: [], is_required: false }}
            value={draft.source}
            onChange={v => onChange({ source: v == null ? null : String(v) })}
          />
          <div className="sm:col-span-2">
            <CrmFieldInput
              definition={{ field_key: "notes", label: "Notas", field_type: "textarea", options: [], is_required: false }}
              value={draft.notes}
              onChange={v => onChange({ notes: v == null ? null : String(v) })}
            />
          </div>
        </div>
        {draft.contact_id && (
          <Link
            href={`/dashboard/crm/contactos/${draft.contact_id}`}
            className="text-xs text-[#a5a5ff] hover:underline inline-block"
          >
            Ver ficha del contacto →
          </Link>
        )}
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
