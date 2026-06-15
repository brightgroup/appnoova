"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { filterPipelineStages } from "@/lib/crm-record";
import { CrmDetailLayout } from "@/components/crm/CrmDetailLayout";
import { CrmLeadForm } from "@/components/crm/CrmLeadForm";
import type { CrmContact, CrmLead, CrmPipelineStage, CrmPropertyDefinition } from "@/types/crm";

function LeadEditContent({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [properties, setProperties] = useState<CrmPropertyDefinition[]>([]);
  const [draft, setDraft] = useState<Partial<CrmLead>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const headers = await getAuthHeaders();
    const [detailRes, stagesRes, contactsRes, propsRes] = await Promise.all([
      fetch(`/api/crm/leads/${leadId}`, { headers }),
      fetch("/api/crm/stages", { headers }),
      fetch("/api/crm/contacts", { headers }),
      fetch("/api/crm/properties?entity=lead", { headers })
    ]);
    const detail = await detailRes.json();
    const stagesData = await stagesRes.json();
    const contactsData = await contactsRes.json();
    const props = await propsRes.json();

    if (!detailRes.ok) {
      setError(detail.error || "Lead no encontrado");
      setLoading(false);
      return;
    }
    setLead(detail.lead);
    setDraft(detail.lead);
    if (stagesRes.ok) setStages(stagesData.stages ?? []);
    if (contactsRes.ok) setContacts(contactsData.contacts ?? []);
    if (propsRes.ok) setProperties(props.properties ?? []);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!lead) return;
    setSaving(true);
    setError("");
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/leads/${lead.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        title: draft.title,
        stage_id: draft.stage_id,
        outcome: draft.outcome,
        contact_id: draft.contact_id,
        value_amount: draft.value_amount,
        currency: draft.currency,
        source: draft.source,
        notes: draft.notes,
        motivo_perdida: draft.motivo_perdida,
        motivo_perdida_detalle: draft.motivo_perdida_detalle,
        asesor_responsable: draft.asesor_responsable,
        categoria_interes: draft.categoria_interes,
        producto_interes: draft.producto_interes,
        score: draft.score,
        temperatura: draft.temperatura,
        inbox_conversation_id: draft.inbox_conversation_id,
        metadata: draft.metadata
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Error al guardar");
      setSaving(false);
      return;
    }
    setLead(data.lead);
    setDraft(data.lead);
    setSaving(false);
  };

  const remove = async () => {
    if (!lead || !confirm("¿Eliminar este lead?")) return;
    const headers = await getAuthHeaders();
    await fetch(`/api/crm/leads/${lead.id}`, { method: "DELETE", headers });
    router.push("/dashboard/crm/leads");
  };

  const stage = filterPipelineStages(stages).find(s => s.id === draft.stage_id);

  return (
    <CrmDetailLayout
      backHref="/dashboard/crm/leads"
      title={draft.title || lead?.title || "Lead"}
      subtitle={stage ? `Etapa: ${stage.name}` : "Oportunidad en pipeline"}
      loading={loading}
      saving={saving}
      error={error}
      onSave={save}
      onDelete={remove}
    >
      {lead && (
        <CrmLeadForm
          draft={draft}
          stages={stages}
          contacts={contacts}
          properties={properties}
          leadId={lead.id}
          onChange={patch => setDraft(d => ({ ...d, ...patch }))}
          onMetaChange={(key, value) =>
            setDraft(d => ({ ...d, metadata: { ...(d.metadata ?? {}), [key]: value } }))
          }
          onLeadSynced={synced => {
            setLead(synced);
            setDraft(synced);
          }}
          createdAt={lead.created_at}
          updatedAt={lead.updated_at}
        />
      )}
    </CrmDetailLayout>
  );
}

export default function LeadEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      }
    >
      <LeadEditContent leadId={id} />
    </Suspense>
  );
}
