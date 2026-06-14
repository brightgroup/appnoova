"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { CrmDetailLayout } from "@/components/crm/CrmDetailLayout";
import { CrmContactForm } from "@/components/crm/CrmContactForm";
import type { CrmContact } from "@/types/crm";

const EMPTY: Partial<CrmContact> = {
  name: "",
  email: null,
  phone: null,
  company: null,
  job_title: null,
  source: null,
  notes: null,
  metadata: {}
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
        email: draft.email,
        phone: draft.phone,
        company: draft.company,
        job_title: draft.job_title,
        source: draft.source,
        notes: draft.notes,
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
      subtitle="Completa la información básica"
      saving={saving}
      saveLabel="Crear contacto"
      error={error}
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
