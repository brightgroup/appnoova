"use client";

import { useEffect, useMemo, useState } from "react";
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
import { PlateBadge } from "@/components/crm/PlateBadge";
import { LeadContactCard } from "@/components/crm/LeadContactCard";
import { LeadCotizacionCard } from "@/components/crm/LeadCotizacionCard";
import { LeadRamoDatosCard } from "@/components/crm/LeadRamoDatosCard";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import { resolveRamoIcon } from "@/lib/ramo-icons";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { StickyNote } from "lucide-react";
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

interface RamoCatalogo {
  id: string;
  nombre: string;
  slug: string;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5 space-y-3">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children}
    </div>
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
  /** Solo quien tiene nivel `manage` en el módulo crm puede reasignar — ver src/lib/crm-auth.ts. */
  canManageAll?: boolean;
  assignableMembers?: { user_id: string; email: string; full_name?: string }[];
  /** Organización con el módulo `seguros` activo — cambia la plantilla de la ficha de Cotización y habilita el campo Ramo. */
  showSeguroPanel?: boolean;
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
  updatedAt,
  canManageAll,
  assignableMembers,
  showSeguroPanel
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

  const hasRamoField = properties.some(p => p.field_key === "ramo");
  const otherProperties = properties.filter(p => p.field_key !== "ramo");
  const [ramosCatalogo, setRamosCatalogo] = useState<RamoCatalogo[]>([]);

  useEffect(() => {
    if (!hasRamoField) return;
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/ramos", { headers });
      if (res.ok) setRamosCatalogo((await res.json()).ramos ?? []);
    })();
  }, [hasRamoField]);

  const ramoOptions = useMemo(
    () =>
      ramosCatalogo.map(r => {
        const { icon: Icon, color } = resolveRamoIcon(r.slug);
        return { value: r.slug, label: r.nombre, icon: <Icon className="w-3.5 h-3.5" style={{ color }} /> };
      }),
    [ramosCatalogo]
  );
  const ramoValue = typeof draft.metadata?.ramo === "string" ? draft.metadata.ramo : "";

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
    <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
      {/* Columna principal */}
      <div className="space-y-5 min-w-0">
        <Card title="Oportunidad">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Título</label>
              <div className="flex items-center gap-2">
                <input
                  value={draft.title ?? ""}
                  onChange={e => onChange({ title: e.target.value })}
                  className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-white"
                />
                {typeof draft.metadata?.placa === "string" && draft.metadata.placa && (
                  <PlateBadge plate={draft.metadata.placa} className="shrink-0" />
                )}
              </div>
            </div>
            {hasRamoField && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Ramo</label>
                <NoovaSelect
                  value={ramoValue}
                  onChange={v => onMetaChange("ramo", v || null)}
                  allowEmpty
                  emptyLabel="Seleccionar ramo…"
                  searchable
                  options={ramoOptions}
                />
              </div>
            )}
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
            <span className="text-[#99c9ff] font-semibold tabular-nums ml-auto text-sm">
              {formatLeadValue(draft.value_amount ?? null, draft.currency ?? "COP")}
            </span>
          </div>
        </Card>

        <Card title="Pipeline">
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
        </Card>

        <div className="rounded-2xl border border-[#0f7eff]/15 bg-[#0f7eff]/[.03] p-5 space-y-2">
          <div className="flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-[#99c9ff]" />
            <h2 className="text-sm font-semibold text-white">Notas</h2>
          </div>
          <textarea
            value={draft.notes ?? ""}
            onChange={e => onChange({ notes: e.target.value || null })}
            rows={7}
            placeholder="Notas del asesor o resumen que va dejando ORI durante la conversación…"
            className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-4 py-3 text-sm text-gray-200 leading-relaxed resize-y min-h-[140px]"
          />
        </div>

        <CollapsibleCard title="Asignación">
          <div className="grid sm:grid-cols-2 gap-3 pt-3">
            {canManageAll && assignableMembers && assignableMembers.length > 0 && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Asignado a <span className="text-gray-600">(quién puede ver y trabajar este lead)</span>
                </label>
                <NoovaSelect
                  value={draft.assigned_user_id ?? ""}
                  onChange={v => onChange({ assigned_user_id: v || null })}
                  options={[
                    { value: "", label: "Sin asignar (solo tú)" },
                    ...assignableMembers.map(m => ({
                      value: m.user_id,
                      label: m.full_name ? `${m.full_name} · ${m.email}` : m.email
                    }))
                  ]}
                />
              </div>
            )}
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
          </div>
        </CollapsibleCard>

        {otherProperties.length > 0 && (
          <CollapsibleCard title="Propiedades adicionales">
            <div className="grid sm:grid-cols-2 gap-3 pt-3">
              {otherProperties.map(prop => (
                <div key={prop.id} className={prop.field_type === "textarea" ? "sm:col-span-2" : ""}>
                  <CrmFieldInput
                    definition={prop}
                    value={draft.metadata?.[prop.field_key]}
                    onChange={v => onMetaChange(prop.field_key, v)}
                  />
                </div>
              ))}
            </div>
          </CollapsibleCard>
        )}

        {createdAt && updatedAt && (
          <div className="flex justify-between text-xs text-gray-500 pt-1">
            <span>Creado {formatCrmDateTime(createdAt)}</span>
            <span>Actualizado {formatCrmDateTime(updatedAt)}</span>
          </div>
        )}
      </div>

      {/* Columna lateral — fichas relacionadas */}
      <div className="space-y-5">
        <LeadContactCard
          contact={contact}
          contacts={contacts}
          onChangeContact={v => onChange({ contact_id: v || undefined })}
        />
        {showSeguroPanel && leadId && <LeadRamoDatosCard leadId={leadId} />}
        <LeadCotizacionCard
          isSeguros={Boolean(showSeguroPanel)}
          leadId={leadId}
          contactId={draft.contact_id}
          quoteEndpoint={quoteEndpoint}
          inboxConversationId={inboxId}
          syncing={syncing}
          syncMsg={syncMsg}
          onSync={syncFromConversation}
        />
      </div>
    </div>
  );
}
