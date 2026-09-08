"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Megaphone, Pause, Play, Plus, Search, Trash2, X } from "lucide-react";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { Badge } from "@/components/ui/Badge";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary, btnGhost, modalInput } from "@/lib/brand-ui";

interface RecipientCounts {
  pendiente: number;
  enviado: number;
  fallido: number;
  omitido_optout: number;
}

interface CampaignRow {
  campaign: {
    id: string;
    name: string;
    status: "borrador" | "enviando" | "completada" | "pausada";
    createdAt: string;
  };
  counts: RecipientCounts;
}

interface WhatsAppChannelOption {
  id: string;
  friendly_name: string | null;
  e164: string;
  status: string;
}

interface TemplateOption {
  id: string;
  template_name: string;
  body_preview: string;
  variable_labels: string[];
  status: string;
  twilio_content_sid: string | null;
}

interface ContactOption {
  id: string;
  name: string;
  whatsapp: string | null;
  telefono: string | null;
}

const STATUS_LABEL: Record<CampaignRow["campaign"]["status"], string> = {
  borrador: "Borrador",
  enviando: "Enviando",
  completada: "Completada",
  pausada: "Pausada"
};

const STATUS_VARIANT: Record<CampaignRow["campaign"]["status"], "neutral" | "emerald" | "amber"> = {
  borrador: "neutral",
  enviando: "amber",
  completada: "emerald",
  pausada: "neutral"
};

export default function CampanasWhatsAppPage() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/campaigns/whatsapp", { headers });
    if (res.ok) setRows((await res.json()).campaigns ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStart(id: string) {
    setBusyId(id);
    const headers = await getAuthHeaders();
    await fetch(`/api/campaigns/whatsapp/${id}/start`, { method: "POST", headers });
    await load();
    setBusyId(null);
  }

  async function handlePause(id: string) {
    setBusyId(id);
    const headers = await getAuthHeaders();
    await fetch(`/api/campaigns/whatsapp/${id}/pause`, { method: "POST", headers });
    await load();
    setBusyId(null);
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/campaigns/whatsapp/${id}`, { method: "DELETE", headers });
    if (!res.ok) setError((await res.json()).error || "No se pudo eliminar");
    await load();
    setBusyId(null);
  }

  return (
    <ChannelListPage
      title="Campañas de WhatsApp"
      description="Envía una plantilla ya aprobada a una lista de contactos — renovaciones, reseñas en Google Maps, o cualquier aviso masivo."
      loading={loading}
      onRefresh={load}
      refreshing={loading}
      error={error || undefined}
      action={
        <button type="button" onClick={() => setModalOpen(true)} className={`${btnPrimary} !text-xs gap-1.5`}>
          <Plus className="w-3.5 h-3.5" /> Nueva campaña
        </button>
      }
    >
      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/[.08] bg-black/20 p-10 text-center text-sm text-gray-500">
          <Megaphone className="w-6 h-6 mx-auto mb-2 text-gray-600" />
          Aún no has creado ninguna campaña.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ campaign, counts }) => {
            const total = counts.pendiente + counts.enviado + counts.fallido + counts.omitido_optout;
            const done = counts.enviado + counts.fallido + counts.omitido_optout;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <div key={campaign.id} className="rounded-xl border border-white/[.08] bg-black/20 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-sm font-medium text-white flex-1 min-w-0 truncate">{campaign.name}</p>
                  <Badge variant={STATUS_VARIANT[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
                  {campaign.status !== "completada" && (
                    <button
                      type="button"
                      disabled={busyId === campaign.id}
                      onClick={() => (campaign.status === "enviando" ? handlePause(campaign.id) : handleStart(campaign.id))}
                      className={`${btnGhost} !px-2.5 !py-1.5 !text-xs gap-1`}
                    >
                      {busyId === campaign.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : campaign.status === "enviando" ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      {campaign.status === "enviando" ? "Pausar" : "Iniciar"}
                    </button>
                  )}
                  {campaign.status !== "enviando" && (
                    <button
                      type="button"
                      disabled={busyId === campaign.id}
                      onClick={() => handleDelete(campaign.id)}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-white/[.06] overflow-hidden">
                  <div className="h-full bg-[#0f7eff] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {counts.enviado} enviados · {counts.fallido} fallidos · {counts.omitido_optout} omitidos (opt-out) ·{" "}
                  {counts.pendiente} pendientes
                </p>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <NewCampaignModal
          onClose={() => setModalOpen(false)}
          onCreated={async () => {
            setModalOpen(false);
            await load();
          }}
          creating={creating}
          setCreating={setCreating}
          setError={setError}
        />
      )}
    </ChannelListPage>
  );
}

function NewCampaignModal({
  onClose,
  onCreated,
  creating,
  setCreating,
  setError
}: {
  onClose: () => void;
  onCreated: () => void;
  creating: boolean;
  setCreating: (v: boolean) => void;
  setError: (v: string) => void;
}) {
  const [name, setName] = useState("");
  const [channels, setChannels] = useState<WhatsAppChannelOption[]>([]);
  const [channelId, setChannelId] = useState("");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<ContactOption[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<ContactOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/whatsapp/channels", { headers });
      if (res.ok) setChannels((await res.json()).channels ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!channelId) {
      setTemplates([]);
      setTemplateId("");
      return;
    }
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp/templates?whatsapp_channel_id=${channelId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const approved = ((data.templates ?? []) as TemplateOption[]).filter(t =>
          ["approved", "active"].includes(t.status)
        );
        setTemplates(approved);
      }
    })();
  }, [channelId]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!contactQuery.trim()) {
        setContactResults([]);
        return;
      }
      setSearching(true);
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/crm/contacts?q=${encodeURIComponent(contactQuery.trim())}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setContactResults(
          ((data.contacts ?? []) as ContactOption[]).filter(c => c.whatsapp || c.telefono)
        );
      }
      setSearching(false);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [contactQuery]);

  const selectedTemplate = useMemo(() => templates.find(t => t.id === templateId) ?? null, [templates, templateId]);

  function toggleContact(contact: ContactOption) {
    setSelectedContacts(prev =>
      prev.some(c => c.id === contact.id) ? prev.filter(c => c.id !== contact.id) : [...prev, contact]
    );
  }

  async function handleCreate() {
    if (!name.trim() || !channelId || !templateId || selectedContacts.length === 0) return;
    setCreating(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/campaigns/whatsapp", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          whatsapp_channel_id: channelId,
          template_id: templateId,
          recipients: selectedContacts.map(c => ({
            contact_id: c.id,
            contact_name: c.name,
            phone_e164: c.whatsapp || c.telefono || "",
            variable_values: { contact_name: c.name }
          }))
        })
      });
      if (!res.ok) {
        setError((await res.json()).error || "No se pudo crear la campaña");
        return;
      }
      onCreated();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-white/[.08] bg-noova-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Nueva campaña de WhatsApp</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Nombre de la campaña</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej. Renovaciones de septiembre"
              className={modalInput}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Canal de WhatsApp</label>
            <NoovaSelect
              value={channelId}
              onChange={setChannelId}
              allowEmpty
              emptyLabel="Selecciona un canal"
              options={channels.map(c => ({ value: c.id, label: c.friendly_name || c.e164 }))}
            />
          </div>

          {channelId && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Plantilla aprobada</label>
              <NoovaSelect
                value={templateId}
                onChange={setTemplateId}
                allowEmpty
                emptyLabel={templates.length ? "Selecciona una plantilla" : "Sin plantillas aprobadas en este canal"}
                options={templates.map(t => ({ value: t.id, label: t.template_name }))}
              />
              {selectedTemplate && <p className="text-[11px] text-gray-500 mt-1.5">{selectedTemplate.body_preview}</p>}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Destinatarios {selectedContacts.length > 0 && `(${selectedContacts.length} seleccionados)`}
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={contactQuery}
                onChange={e => setContactQuery(e.target.value)}
                placeholder="Buscar contactos por nombre, teléfono o email"
                className={`${modalInput} !pl-8`}
              />
            </div>
            {searching && <p className="text-[11px] text-gray-500 mt-1.5">Buscando…</p>}
            {contactResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-white/[.08] divide-y divide-white/[.06]">
                {contactResults.map(c => {
                  const checked = selectedContacts.some(sc => sc.id === c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2.5 p-2.5 text-xs cursor-pointer hover:bg-white/[.03]">
                      <input type="checkbox" checked={checked} onChange={() => toggleContact(c)} />
                      <span className="text-white">{c.name}</span>
                      <span className="text-gray-500 ml-auto">{c.whatsapp || c.telefono}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {selectedContacts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedContacts.map(c => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[.06] text-[11px] text-gray-300"
                  >
                    {c.name}
                    <button type="button" onClick={() => toggleContact(c)} className="hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className={`${btnGhost} !text-xs`}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !name.trim() || !channelId || !templateId || selectedContacts.length === 0}
            className={`${btnPrimary} !text-xs gap-1.5`}
          >
            {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Crear campaña
          </button>
        </div>
      </div>
    </div>
  );
}
