"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { CrmDetailLayout } from "@/components/crm/CrmDetailLayout";
import { CrmContactForm } from "@/components/crm/CrmContactForm";
import type { CrmContact, CrmLead, CrmPropertyDefinition } from "@/types/crm";

function ContactEditContent({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [contact, setContact] = useState<CrmContact | null>(null);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [properties, setProperties] = useState<CrmPropertyDefinition[]>([]);
  const [draft, setDraft] = useState<Partial<CrmContact>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const headers = await getAuthHeaders();
    const [detailRes, propsRes] = await Promise.all([
      fetch(`/api/crm/contacts/${contactId}`, { headers }),
      fetch("/api/crm/properties?entity=contact", { headers })
    ]);
    const detail = await detailRes.json();
    const props = await propsRes.json();
    if (!detailRes.ok) {
      setError(detail.error || "Contacto no encontrado");
      setLoading(false);
      return;
    }
    setContact(detail.contact);
    setLeads(detail.leads ?? []);
    setDraft(detail.contact);
    if (propsRes.ok) setProperties(props.properties ?? []);
    setLoading(false);
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!contact) return;
    setSaving(true);
    setError("");
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/contacts/${contact.id}`, {
      method: "PATCH",
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
      setError(data.error || "Error al guardar");
      setSaving(false);
      return;
    }
    setContact(data.contact);
    setDraft(data.contact);
    setSaving(false);
  };

  const remove = async () => {
    if (!contact || !confirm("¿Eliminar este contacto?")) return;
    const headers = await getAuthHeaders();
    await fetch(`/api/crm/contacts/${contact.id}`, { method: "DELETE", headers });
    router.push("/dashboard/crm/contactos");
  };

  return (
    <CrmDetailLayout
      backHref="/dashboard/crm/contactos"
      title={draft.name || contact?.name || "Contacto"}
      subtitle={draft.phone || contact?.phone || "Datos del contacto"}
      loading={loading}
      saving={saving}
      error={error}
      onSave={save}
      onDelete={remove}
    >
      {contact && (
        <CrmContactForm
          draft={draft}
          properties={properties}
          leads={leads}
          onChange={patch => setDraft(d => ({ ...d, ...patch }))}
          onMetaChange={(key, value) =>
            setDraft(d => ({ ...d, metadata: { ...(d.metadata ?? {}), [key]: value } }))
          }
          createdAt={contact.created_at}
          updatedAt={contact.updated_at}
        />
      )}
    </CrmDetailLayout>
  );
}

export default function ContactEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      }
    >
      <ContactEditContent contactId={id} />
    </Suspense>
  );
}
