"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Loader2, Sparkles, UserCircle } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { CrmContactForm } from "@/components/crm/CrmContactForm";
import { CrmContactAiTools, useCrmContactCall } from "@/components/crm/CrmContactAiTools";
import {
  CrmContactDetailShell,
  type CrmContactTabId
} from "@/components/crm/CrmContactDetailShell";
import { CrmContactHeaderActions } from "@/components/crm/CrmContactHeaderActions";
import {
  CrmContactDuplicatesBanner,
  CrmContactNextStep,
  CrmContactTimeline
} from "@/components/crm/CrmContactTimeline";
import { computeContactNextStep } from "@/lib/crm-contact-next-step";
import { enrichCrmContact } from "@/lib/crm-record";
import type { CrmContact, CrmLead, CrmPropertyDefinition, CrmTenantLabels } from "@/types/crm";

const TABS = [
  { id: "perfil" as const, label: "Perfil", icon: UserCircle },
  { id: "actividad" as const, label: "Actividad", icon: Activity },
  { id: "ori" as const, label: "ORI", icon: Sparkles }
];

function buildSubtitle(contact: Partial<CrmContact>): string {
  const parts: string[] = [];
  if (contact.whatsapp) parts.push(contact.whatsapp);
  else if (contact.telefono) parts.push(contact.telefono);
  else if (contact.email) parts.push(contact.email);
  if (contact.organizacion) parts.push(contact.organizacion);
  else if (contact.ciudad) parts.push(contact.ciudad);
  return parts.join(" · ") || "Ficha de contacto";
}

function ContactEditContent({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [contact, setContact] = useState<CrmContact | null>(null);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [properties, setProperties] = useState<CrmPropertyDefinition[]>([]);
  const [labels, setLabels] = useState<CrmTenantLabels | undefined>();
  const [draft, setDraft] = useState<Partial<CrmContact>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<CrmContactTabId>("perfil");

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
    setLabels(detail.labels);
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
        tipo_contacto: draft.tipo_contacto,
        documento_id: draft.documento_id,
        organizacion: draft.organizacion,
        whatsapp: draft.whatsapp,
        telefono: draft.telefono,
        email: draft.email,
        canal_preferido: draft.canal_preferido,
        supresiones: draft.supresiones,
        autorizacion_datos: draft.autorizacion_datos,
        fuente_origen: draft.fuente_origen,
        categorias_interes: draft.categorias_interes,
        ciudad: draft.ciudad,
        tipo_relacion: draft.tipo_relacion,
        tags: draft.tags,
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

  const { startCall, busy: callBusy, message: callMessage } = useCrmContactCall(contactId);
  const [quoteBusy, setQuoteBusy] = useState(false);

  const goToQuote = useCallback(() => {
    setActiveTab("ori");
    setTimeout(() => {
      document.getElementById("crm-quote-section")?.scrollIntoView({ behavior: "smooth" });
      document.getElementById("crm-generate-quote-btn")?.click();
    }, 150);
  }, []);

  const enriched = contact ? enrichCrmContact(contact) : null;
  const nextStep = enriched
    ? computeContactNextStep({
        contact: enriched,
        openLeads: leads.filter(l => l.outcome === "open")
      })
    : null;

  const subtitle = useMemo(() => buildSubtitle(draft), [draft]);

  return (
    <CrmContactDetailShell
      backHref="/dashboard/crm/contactos"
      title={draft.name || contact?.name || "Contacto"}
      subtitle={subtitle}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      loading={loading}
      saving={saving}
      error={error}
      onSave={save}
      onDelete={remove}
      headerActions={
        contact ? (
          <CrmContactHeaderActions
            contact={enriched ?? contact}
            contactId={contactId}
            onCall={startCall}
            callBusy={callBusy}
            onQuote={goToQuote}
            quoteBusy={quoteBusy}
          />
        ) : undefined
      }
    >
      {contact && (
        <>
          <CrmContactDuplicatesBanner contactId={contactId} onMerged={load} />

          {activeTab === "perfil" && (
            <CrmContactForm
              draft={draft}
              properties={properties}
              labels={labels}
              onChange={patch => setDraft(d => ({ ...d, ...patch }))}
              onMetaChange={(key, value) =>
                setDraft(d => ({ ...d, metadata: { ...(d.metadata ?? {}), [key]: value } }))
              }
              createdAt={contact.created_at}
              updatedAt={contact.updated_at}
            />
          )}

          {activeTab === "actividad" && (
            <>
              {nextStep && <CrmContactNextStep message={nextStep.message} href={nextStep.href} />}
              {callMessage && (
                <p className="mb-4 text-xs text-[#99c9ff]">{callMessage}</p>
              )}
              <CrmContactTimeline
                contactId={contactId}
                inboxConversationId={contact.inbox_conversation_id}
                leads={leads}
              />
            </>
          )}

          {activeTab === "ori" && (
            <CrmContactAiTools
              contactId={contactId}
              contact={contact}
              labels={labels}
              onContactUpdated={c => {
                setContact(c);
                setDraft(c);
              }}
              onQuoteBusyChange={setQuoteBusy}
            />
          )}
        </>
      )}
    </CrmContactDetailShell>
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
