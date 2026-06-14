"use client";

import Link from "next/link";
import { CONTACT_BUILTIN_FIELDS, formatLeadValue } from "@/lib/crm-record";
import { CrmFieldInput, formatCrmDateTime } from "@/components/crm/CrmFieldInput";
import type { CrmContact, CrmLead, CrmPropertyDefinition } from "@/types/crm";

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

interface CrmContactFormProps {
  draft: Partial<CrmContact>;
  properties: CrmPropertyDefinition[];
  leads?: CrmLead[];
  onChange: (patch: Partial<CrmContact>) => void;
  onMetaChange: (key: string, value: string | number | boolean | null) => void;
  createdAt?: string;
  updatedAt?: string;
}

export function CrmContactForm({
  draft,
  properties,
  leads = [],
  onChange,
  onMetaChange,
  createdAt,
  updatedAt
}: CrmContactFormProps) {
  const setBuiltin = (key: string, value: string | null) => {
    onChange({ [key]: value });
  };

  return (
    <>
      <FieldGroup title="Información básica">
        <div className="grid sm:grid-cols-2 gap-3">
          {CONTACT_BUILTIN_FIELDS.map(field => (
            <div key={field.key} className={field.field_type === "textarea" ? "sm:col-span-2" : ""}>
              <CrmFieldInput
                definition={{
                  field_key: field.key,
                  label: field.label,
                  field_type: field.field_type,
                  options: [],
                  is_required: field.required ?? false
                }}
                value={draft[field.key] as string | null}
                onChange={v => setBuiltin(field.key, v == null ? null : String(v))}
              />
            </div>
          ))}
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

      {leads.length > 0 && (
        <FieldGroup title="Leads vinculados">
          <ul className="divide-y divide-white/[.06] rounded-xl border border-white/[.08]">
            {leads.map(lead => (
              <li key={lead.id}>
                <Link
                  href={`/dashboard/crm/leads/${lead.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-white/[.03]"
                >
                  <span className="text-white truncate">{lead.title}</span>
                  <span className="text-xs text-[#a5a5ff] shrink-0">
                    {formatLeadValue(lead.value_amount, lead.currency)}
                  </span>
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
