"use client";

import Link from "next/link";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { CONTACT_BUILTIN_FIELDS, formatLeadValue } from "@/lib/crm-record";
import {
  FUENTE_ORIGEN_OPTIONS,
  VENTANA_WA_LABELS
} from "@/lib/crm-contactability";
import { CrmFieldInput, formatCrmDateTime } from "@/components/crm/CrmFieldInput";
import { CrmFieldProvenanceBadge } from "@/components/crm/CrmFieldProvenanceBadge";
import { CrmToggleChip } from "@/components/crm/CrmToggleChip";
import type { CrmContact, CrmLead, CrmPropertyDefinition, CrmSuppression, CrmTenantLabels, TipoContacto } from "@/types/crm";

const inputClass =
  "w-full rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#5b5bf6]/50";

/** Campos builtin de metadata que ya tienen columna propia en el contacto. */
const BUILTIN_COLUMN_KEYS = new Set(["ciudad"]);

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

function FieldWithProvenance({
  fieldKey,
  label,
  provenance,
  children
}: {
  fieldKey: string;
  label: string;
  provenance?: CrmContact["field_provenance"];
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      {children}
      <CrmFieldProvenanceBadge provenance={provenance?.[fieldKey]} />
    </div>
  );
}

interface CrmContactFormProps {
  draft: Partial<CrmContact>;
  properties: CrmPropertyDefinition[];
  labels?: CrmTenantLabels;
  leads?: CrmLead[];
  showLeads?: boolean;
  onChange: (patch: Partial<CrmContact>) => void;
  onMetaChange: (key: string, value: string | number | boolean | null) => void;
  createdAt?: string;
  updatedAt?: string;
}

const SUPPRESSION_OPTIONS: { value: CrmSuppression; label: string; description: string }[] = [
  { value: "no_whatsapp", label: "No WhatsApp", description: "Bloquea envíos por WhatsApp" },
  { value: "no_llamadas", label: "No llamadas", description: "Bloquea llamadas de voz / IA" },
  { value: "no_email", label: "No email", description: "Bloquea comunicaciones por email" }
];

export function CrmContactForm({
  draft,
  properties,
  labels,
  leads = [],
  showLeads = false,
  onChange,
  onMetaChange,
  createdAt,
  updatedAt
}: CrmContactFormProps) {
  const prov = draft.field_provenance ?? {};
  const categoriasLabel = labels?.categoria_interes ?? "Categoría de interés";

  const builtinProps = properties.filter(
    p => p.is_builtin && !BUILTIN_COLUMN_KEYS.has(p.field_key)
  );
  const customProps = properties.filter(p => !p.is_builtin);

  const toggleSupresion = (key: CrmSuppression) => {
    const current = draft.supresiones ?? [];
    const next = current.includes(key) ? current.filter(s => s !== key) : [...current, key];
    onChange({ supresiones: next });
  };

  return (
    <>
      <FieldGroup title="Identidad">
        <div className="grid sm:grid-cols-2 gap-3">
          <FieldWithProvenance fieldKey="name" label="Nombre *" provenance={prov}>
            <input value={draft.name ?? ""} onChange={e => onChange({ name: e.target.value })} required className={inputClass} />
          </FieldWithProvenance>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
            <NoovaSelect
              value={draft.tipo_contacto ?? "persona"}
              onChange={v => onChange({ tipo_contacto: v as TipoContacto })}
              allowEmpty={false}
              options={[
                { value: "persona", label: "Persona" },
                { value: "empresa", label: "Empresa" }
              ]}
            />
            <CrmFieldProvenanceBadge provenance={prov.tipo_contacto} />
          </div>
          <FieldWithProvenance fieldKey="documento_id" label="Documento (CC/NIT)" provenance={prov}>
            <input value={draft.documento_id ?? ""} onChange={e => onChange({ documento_id: e.target.value || null })} className={`${inputClass} font-mono`} />
          </FieldWithProvenance>
          <FieldWithProvenance fieldKey="organizacion" label="Organización" provenance={prov}>
            <input value={draft.organizacion ?? ""} onChange={e => onChange({ organizacion: e.target.value || null })} className={inputClass} />
          </FieldWithProvenance>
        </div>
      </FieldGroup>

      <FieldGroup title="Canales">
        {draft.ventana_wa_estado && (
          <p className="text-xs text-gray-500 mb-2">Ventana WA: {VENTANA_WA_LABELS[draft.ventana_wa_estado]}</p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <FieldWithProvenance fieldKey="whatsapp" label="WhatsApp (E.164)" provenance={prov}>
            <input
              value={draft.whatsapp ?? ""}
              onChange={e => onChange({ whatsapp: e.target.value || null, telefono: draft.telefono || e.target.value || null, phone: draft.telefono || e.target.value || null })}
              placeholder="+573..."
              className={`${inputClass} font-mono`}
            />
          </FieldWithProvenance>
          <FieldWithProvenance fieldKey="telefono" label="Teléfono (voz)" provenance={prov}>
            <input value={draft.telefono ?? ""} onChange={e => onChange({ telefono: e.target.value || null, phone: e.target.value || null })} className={`${inputClass} font-mono`} />
          </FieldWithProvenance>
          <FieldWithProvenance fieldKey="email" label="Email" provenance={prov}>
            <input type="email" value={draft.email ?? ""} onChange={e => onChange({ email: e.target.value || null })} className={inputClass} />
          </FieldWithProvenance>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Canal preferido</label>
            <NoovaSelect
              value={draft.canal_preferido ?? ""}
              onChange={v => onChange({ canal_preferido: (v || null) as CrmContact["canal_preferido"] })}
              options={[
                { value: "whatsapp", label: "WhatsApp" },
                { value: "telefono", label: "Teléfono" },
                { value: "email", label: "Email" }
              ]}
            />
          </div>
        </div>
      </FieldGroup>

      <FieldGroup title="Contactabilidad">
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Supresiones (opt-out)</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {SUPPRESSION_OPTIONS.map(opt => (
              <CrmToggleChip
                key={opt.value}
                checked={(draft.supresiones ?? []).includes(opt.value)}
                onChange={() => toggleSupresion(opt.value)}
                label={opt.label}
                description={opt.description}
                tone="danger"
              />
            ))}
          </div>
          <CrmToggleChip
            checked={Boolean(draft.autorizacion_datos)}
            onChange={v => onChange({ autorizacion_datos: v })}
            label="Autorización de datos (Habeas Data)"
            description="El contacto autorizó el tratamiento de sus datos personales."
            tone="success"
          />
          {draft.autorizacion_datos_fecha && (
            <p className="text-xs text-gray-500">
              Registrada {formatCrmDateTime(draft.autorizacion_datos_fecha)}
              {draft.autorizacion_datos_fuente ? ` · ${draft.autorizacion_datos_fuente}` : ""}
            </p>
          )}
        </div>
      </FieldGroup>

      <FieldGroup title="Contexto">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Fuente de origen</label>
            <NoovaSelect
              value={draft.fuente_origen ?? ""}
              onChange={v => onChange({ fuente_origen: v || null, source: v || null })}
              options={FUENTE_ORIGEN_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            />
          </div>
          <FieldWithProvenance fieldKey="ciudad" label="Ciudad" provenance={prov}>
            <input value={draft.ciudad ?? ""} onChange={e => onChange({ ciudad: e.target.value || null })} className={inputClass} />
          </FieldWithProvenance>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{categoriasLabel}</label>
            <input
              value={(draft.categorias_interes ?? []).join(", ")}
              onChange={e => onChange({ categorias_interes: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
              placeholder="Separadas por coma"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Etiquetas</label>
            <input
              value={(draft.tags ?? []).join(", ")}
              onChange={e => onChange({ tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
              placeholder="Separadas por coma"
              className={inputClass}
            />
          </div>
          {builtinProps.map(prop => (
            <div key={prop.id} className={prop.field_type === "textarea" ? "sm:col-span-2" : ""}>
              <CrmFieldInput
                definition={prop}
                value={draft.metadata?.[prop.field_key]}
                onChange={v => onMetaChange(prop.field_key, v)}
              />
              <CrmFieldProvenanceBadge provenance={prov[prop.field_key]} />
            </div>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup title="Notas">
        {CONTACT_BUILTIN_FIELDS.filter(f => f.key === "notes").map(field => (
          <CrmFieldInput
            key={field.key}
            definition={{ field_key: field.key, label: field.label, field_type: field.field_type, options: [], is_required: false }}
            value={draft.notes}
            onChange={v => onChange({ notes: v == null ? null : String(v) })}
          />
        ))}
      </FieldGroup>

      {customProps.length > 0 && (
        <FieldGroup title="Campos personalizados">
          <div className="grid sm:grid-cols-2 gap-3">
            {customProps.map(prop => (
              <div key={prop.id} className={prop.field_type === "textarea" ? "sm:col-span-2" : ""}>
                <CrmFieldInput definition={prop} value={draft.metadata?.[prop.field_key]} onChange={v => onMetaChange(prop.field_key, v)} />
                <CrmFieldProvenanceBadge provenance={prov[prop.field_key]} />
              </div>
            ))}
          </div>
        </FieldGroup>
      )}

      {showLeads && leads.length > 0 && (
        <FieldGroup title="Leads vinculados">
          <ul className="divide-y divide-white/[.06]">
            {leads.map(lead => (
              <li key={lead.id}>
                <Link href={`/dashboard/crm/leads/${lead.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-[#a5a5ff]">
                  <span className="text-white truncate">{lead.title}</span>
                  <span className="text-xs text-[#a5a5ff] shrink-0">{formatLeadValue(lead.value_amount, lead.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
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
