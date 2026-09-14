"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Mail, Pencil, Phone } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import type { CrmContact } from "@/types/crm";

interface LeadContactCardProps {
  contact: CrmContact | undefined;
  contacts: CrmContact[];
  onChangeContact: (contactId: string) => void;
}

/** Ficha del contacto asociado al lead — reemplaza el NoovaSelect desnudo de antes. Click en la tarjeta navega al contacto; el lápiz reabre el selector para reasignar. */
export function LeadContactCard({ contact, contacts, onChangeContact }: LeadContactCardProps) {
  const [editing, setEditing] = useState(false);

  if (editing || !contact) {
    return (
      <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5">
        <p className="text-sm font-semibold text-white mb-3">Contacto</p>
        <NoovaSelect
          value={contact?.id ?? ""}
          onChange={v => {
            onChangeContact(v);
            setEditing(false);
          }}
          allowEmpty
          emptyLabel="Seleccionar contacto…"
          options={contacts.map(c => ({
            value: c.id,
            label: `${c.name}${c.whatsapp ? ` · ${c.whatsapp}` : c.phone ? ` · ${c.phone}` : ""}`
          }))}
        />
      </div>
    );
  }

  const phone = contact.whatsapp || contact.telefono || contact.phone;
  const company = contact.organizacion || contact.company;
  const initial = contact.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white">Contacto</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Cambiar contacto"
          className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-white/[.08]"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      <Link
        href={`/dashboard/crm/contactos/${contact.id}`}
        className="flex items-start gap-3 -mx-1 px-1 py-1 rounded-xl hover:bg-white/[.04] transition-colors"
      >
        <span className="w-10 h-10 rounded-full bg-[#0f7eff]/15 text-[#99c9ff] flex items-center justify-center text-sm font-semibold shrink-0">
          {initial}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-white truncate">{contact.name}</p>
          {company && (
            <p className="text-xs text-gray-500 flex items-center gap-1.5 truncate">
              <Building2 className="w-3 h-3 shrink-0" /> {company}
            </p>
          )}
          {phone && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5 truncate">
              <Phone className="w-3 h-3 shrink-0" /> {phone}
            </p>
          )}
          {contact.email && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5 truncate">
              <Mail className="w-3 h-3 shrink-0" /> {contact.email}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}
