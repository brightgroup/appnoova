"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { filterPipelineStages } from "@/lib/crm-record";
import { leadFromContactDefaults, validateLeadPayload } from "@/lib/crm-lead-utils";
import { CrmDetailLayout } from "@/components/crm/CrmDetailLayout";
import { CrmLeadForm } from "@/components/crm/CrmLeadForm";
import type { CrmContact, CrmLead, CrmPipelineStage, CrmPropertyDefinition } from "@/types/crm";

function LeadCreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillContactId = searchParams.get("contact_id");
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [properties, setProperties] = useState<CrmPropertyDefinition[]>([]);
  const [draft, setDraft] = useState<Partial<CrmLead>>({
    title: "",
    outcome: "open",
    currency: "COP",
    contact_id: null,
    value_amount: null,
    source: null,
    notes: null,
    proxima_accion_estado: "pendiente",
    metadata: {}
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const [stagesRes, contactsRes, propsRes] = await Promise.all([
      fetch("/api/crm/stages", { headers }),
      fetch("/api/crm/contacts", { headers }),
      fetch("/api/crm/properties?entity=lead", { headers })
    ]);
    const stagesData = await stagesRes.json();
    const contactsData = await contactsRes.json();
    const props = await propsRes.json();
    const pipeline = filterPipelineStages(stagesData.stages ?? []);
    const contactList: CrmContact[] = contactsRes.ok ? contactsData.contacts ?? [] : [];
    if (stagesRes.ok) setStages(stagesData.stages ?? []);
    if (contactsRes.ok) setContacts(contactList);
    if (propsRes.ok) setProperties(props.properties ?? []);

    const prefillContact = prefillContactId
      ? contactList.find(c => c.id === prefillContactId)
      : null;

    setDraft(d => ({
      ...d,
      stage_id: d.stage_id || pipeline[0]?.id,
      ...(prefillContact ? leadFromContactDefaults(prefillContact) : { contact_id: prefillContactId || d.contact_id })
    }));
    setLoading(false);
  }, [prefillContactId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const validationError = validateLeadPayload({
      outcome: (draft.outcome ?? "open") as CrmLead["outcome"],
      contact_id: draft.contact_id ?? null,
      proxima_accion: draft.proxima_accion ?? null,
      proxima_accion_fecha: draft.proxima_accion_fecha ?? null,
      isCreate: true
    });
    if (!draft.title?.trim()) {
      setError("El título es obligatorio");
      return;
    }
    if (!draft.stage_id) {
      setError("Selecciona una etapa");
      return;
    }
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    const headers = await getAuthHeaders();
    const res = await fetch("/api/crm/leads", {
      method: "POST",
      headers,
      body: JSON.stringify(draft)
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Error al crear lead");
      setSaving(false);
      return;
    }
    router.push(`/dashboard/crm/leads/${data.lead.id}`);
  };

  return (
    <CrmDetailLayout
      backHref="/dashboard/crm/leads"
      title="Nuevo lead"
      subtitle="Define qué hacer con esta oportunidad y cuándo"
      loading={loading}
      saving={saving}
      saveLabel="Crear lead"
      error={error}
      onSave={save}
    >
      <CrmLeadForm
        draft={draft}
        stages={stages}
        contacts={contacts}
        properties={properties}
        onChange={patch => setDraft(d => ({ ...d, ...patch }))}
        onMetaChange={(key, value) =>
          setDraft(d => ({ ...d, metadata: { ...(d.metadata ?? {}), [key]: value } }))
        }
      />
    </CrmDetailLayout>
  );
}

export default function LeadCreatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
        </div>
      }
    >
      <LeadCreatePageInner />
    </Suspense>
  );
}
