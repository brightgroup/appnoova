"use client";

import Link from "next/link";
import {
  CRM_LEAD_OUTCOME_LABELS,
  filterPipelineStages,
  formatLeadValue
} from "@/lib/crm-record";
import {
  CRM_MOTIVO_PERDIDA_LABELS,
  CRM_PROXIMA_ACCION_TIPO_LABELS,
  CRM_TEMPERATURA_LABELS,
  DEFAULT_PROXIMA_ACCION,
  formatProximaAccionFecha
} from "@/lib/crm-lead-utils";
import { FUENTE_ORIGEN_OPTIONS } from "@/lib/crm-contactability";
import { CrmFieldInput, formatCrmDateTime } from "@/components/crm/CrmFieldInput";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import type {
  CrmContact,
  CrmLead,
  CrmLeadOutcome,
  CrmLeadTemperatura,
  CrmMotivoPerdida,
  CrmPipelineStage,
  CrmPropertyDefinition,
  CrmProximaAccionTipo
} from "@/types/crm";

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

function temperaturaBadgeClass(temp: CrmLeadTemperatura | null | undefined): string {
  if (temp === "caliente") return "bg-orange-500/15 text-orange-300";
  if (temp === "tibio") return "bg-amber-500/15 text-amber-200";
  if (temp === "frio") return "bg-sky-500/15 text-sky-300";
  return "bg-white/[.06] text-gray-400";
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
  const isOpen = outcome === "open";
  const contact = contacts.find(c => c.id === draft.contact_id);
  const inboxId = draft.inbox_conversation_id ?? contact?.inbox_conversation_id;

  const markAccionHecha = () => {
    onChange({ proxima_accion_estado: "hecha" });
  };

  return (
    <>
      {isOpen && (
        <FieldGroup title="Acción ahora">
          <div className="rounded-xl border border-[#5b5bf6]/20 bg-[#5b5bf6]/[.06] p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-400 mb-1 block">Próxima acción</label>
                <input
                  value={draft.proxima_accion ?? ""}
                  onChange={e => onChange({ proxima_accion: e.target.value })}
                  placeholder={DEFAULT_PROXIMA_ACCION}
                  className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Cuándo</label>
                <input
                  type="datetime-local"
                  value={
                    draft.proxima_accion_fecha
                      ? new Date(draft.proxima_accion_fecha).toISOString().slice(0, 16)
                      : ""
                  }
                  onChange={e =>
                    onChange({
                      proxima_accion_fecha: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null
                    })
                  }
                  className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
                />
                {draft.proxima_accion_fecha && (
                  <p className="mt-1 text-[10px] text-gray-500">
                    {formatProximaAccionFecha(draft.proxima_accion_fecha)}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
                <NoovaSelect
                  value={draft.proxima_accion_tipo ?? ""}
                  onChange={v => onChange({ proxima_accion_tipo: (v || null) as CrmProximaAccionTipo | null })}
                  allowEmpty
                  emptyLabel="Sin tipo"
                  options={(
                    Object.keys(CRM_PROXIMA_ACCION_TIPO_LABELS) as CrmProximaAccionTipo[]
                  ).map(k => ({ value: k, label: CRM_PROXIMA_ACCION_TIPO_LABELS[k] }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {inboxId && (
                <Link
                  href={`/dashboard/inbox?id=${inboxId}`}
                  className="rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-1.5 text-xs text-[#a5a5ff] hover:bg-white/[.08]"
                >
                  Abrir inbox →
                </Link>
              )}
              {draft.contact_id && (
                <Link
                  href={`/dashboard/crm/contactos/${draft.contact_id}`}
                  className="rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-1.5 text-xs text-[#a5a5ff] hover:bg-white/[.08]"
                >
                  Cotizar ORI →
                </Link>
              )}
              {draft.proxima_accion_estado !== "hecha" && (
                <button
                  type="button"
                  onClick={markAccionHecha}
                  className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/15"
                >
                  Marcar hecha
                </button>
              )}
              {draft.proxima_accion_estado === "hecha" && (
                <span className="text-xs text-emerald-300">Acción completada</span>
              )}
            </div>
          </div>
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
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Categoría de interés</label>
            <input
              value={draft.categoria_interes ?? ""}
              onChange={e => onChange({ categoria_interes: e.target.value || null })}
              placeholder="Ej. Autos, Salud…"
              className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Producto de interés</label>
            <input
              value={draft.producto_interes ?? ""}
              onChange={e => onChange({ producto_interes: e.target.value || null })}
              className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
            />
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
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${outcomeBadgeClass(outcome)}`}>
            {CRM_LEAD_OUTCOME_LABELS[outcome]}
          </span>
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
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${temperaturaBadgeClass(draft.temperatura)}`}>
              {CRM_TEMPERATURA_LABELS[draft.temperatura]}
            </span>
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
        {draft.is_stalled && isOpen && (
          <p className="text-xs text-amber-300/90 rounded-lg bg-amber-500/10 px-3 py-2">
            Lead estancado — lleva más de 5 días en esta etapa sin avance.
          </p>
        )}
      </FieldGroup>

      <FieldGroup title="Contacto">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-400 mb-1 block">Contacto asociado *</label>
            <NoovaSelect
              value={draft.contact_id ?? ""}
              onChange={v => onChange({ contact_id: v || null })}
              allowEmpty
              emptyLabel="Seleccionar contacto…"
              options={contacts.map(c => ({
                value: c.id,
                label: `${c.name}${c.whatsapp ? ` · ${c.whatsapp}` : c.phone ? ` · ${c.phone}` : ""}`
              }))}
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
