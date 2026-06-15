"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { CrmDetailLayout } from "@/components/crm/CrmDetailLayout";
import { CrmContactForm } from "@/components/crm/CrmContactForm";
import type { CrmContact } from "@/types/crm";

const EMPTY: Partial<CrmContact> = {
  name: "",
  tipo_contacto: "persona",
  documento_id: null,
  organizacion: null,
  whatsapp: null,
  telefono: null,
  email: null,
  canal_preferido: null,
  supresiones: [],
  autorizacion_datos: false,
  fuente_origen: null,
  categorias_interes: [],
  ciudad: null,
  tipo_relacion: "prospecto",
  tags: [],
  notes: null,
  metadata: {},
  field_provenance: {}
};

export default function ContactCreatePage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Partial<CrmContact>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!draft.name?.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setError("");
    const headers = await getAuthHeaders();
    const res = await fetch("/api/crm/contacts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: draft.name,
        tipo_contacto: draft.tipo_contacto,
        documento_id: draft.documento_id,
        organizacion: draft.organizacion,
        whatsapp: draft.whatsapp,
        telefono: draft.telefono,
        email: draft.email,
        fuente_origen: draft.fuente_origen,
        ciudad: draft.ciudad,
        notes: draft.notes,
        autorizacion_datos: draft.autorizacion_datos,
        metadata: draft.metadata
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Error al crear contacto");
      setSaving(false);
      return;
    }
    router.push(`/dashboard/crm/contactos/${data.contact.id}`);
  };

  return (
    <CrmDetailLayout
      backHref="/dashboard/crm/contactos"
      title="Nuevo contacto"
      subtitle="Al menos un canal válido (WhatsApp, teléfono o email)"
      saving={saving}
      saveLabel="Crear contacto"
      error={error}
      wide
      onSave={save}
    >
      <CrmContactForm
        draft={draft}
        properties={[]}
        onChange={patch => setDraft(d => ({ ...d, ...patch }))}
        onMetaChange={(key, value) =>
          setDraft(d => ({ ...d, metadata: { ...(d.metadata ?? {}), [key]: value } }))
        }
      />
    </CrmDetailLayout>
  );
}
