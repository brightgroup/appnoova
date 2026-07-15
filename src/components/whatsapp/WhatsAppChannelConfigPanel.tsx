"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2, Save, CheckCircle2, ExternalLink } from "lucide-react";
import { btnPrimary, textMuted } from "@/lib/brand-ui";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { whatsAppChannelStatusLabel } from "@/lib/whatsapp/channel-status";
import {
  WhatsAppEmbeddedSignupModal,
  useWhatsAppEmbeddedSignupEnabled
} from "@/components/whatsapp/WhatsAppEmbeddedSignupModal";
import { WhatsAppChannelLifecycleSection } from "@/components/whatsapp/WhatsAppChannelLifecycleSection";
import {
  WhatsAppChannelConfirmModal,
  type WhatsAppChannelConfirmAction
} from "@/components/whatsapp/WhatsAppChannelConfirmModal";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import type { TextAgentListItem } from "@/types/text-agent";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

export function WhatsAppChannelConfigPanel({ channelId }: { channelId: string }) {
  const router = useRouter();
  const embeddedSignupEnabled = useWhatsAppEmbeddedSignupEnabled();
  const [channel, setChannel] = useState<WhatsAppChannelRecord | null>(null);
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<WhatsAppChannelConfirmAction | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const [chRes, agentsRes] = await Promise.all([
        fetch(`/api/whatsapp/channels/${channelId}`, { headers }),
        fetch("/api/text/agents", { headers })
      ]);
      const chData = await chRes.json();
      const agentsData = await agentsRes.json();

      if (agentsRes.ok) setAgents(agentsData.agents ?? []);

      if (!chRes.ok) {
        setError(chData.error || "No se pudo cargar la línea");
        setChannel(null);
        return;
      }

      const row = chData.channel as WhatsAppChannelRecord;
      setChannel(row);
      setSelectedAgentId(row.text_agent_id ?? "");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!channel || channel.status !== "pending") return;
    let cancelled = false;

    const sync = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/whatsapp/channels/${channelId}/sync`, {
          method: "POST",
          headers,
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.channel) setChannel(data.channel);
      } catch {
        /* ignore polling errors */
      }
    };

    void sync();
    const timer = window.setInterval(() => void sync(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [channel?.status, channelId]);

  const handleSave = async () => {
    if (!channel) return;
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp/channels/${channel.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ text_agent_id: selectedAgentId || null })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar");
        return;
      }
      setChannel(data.channel);
      setSelectedAgentId(data.channel.text_agent_id ?? "");
    } finally {
      setSaving(false);
    }
  };

  const runConfirmAction = async () => {
    if (!channel || !confirmAction) return;
    setActionLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      if (confirmAction === "disconnect") {
        const res = await fetch(`/api/whatsapp/channels/${channel.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ action: "disconnect" })
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "No se pudo desconectar");
          return;
        }
        setChannel(data.channel);
      } else {
        const res = await fetch(`/api/whatsapp/channels/${channel.id}`, {
          method: "DELETE",
          headers
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "No se pudo eliminar");
          return;
        }
        router.push("/dashboard/canales/whatsapp");
        return;
      }
      setConfirmAction(null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReconnect = async () => {
    if (!channel) return;
    setActionLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp/channels/${channel.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action: "reconnect" })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo reconectar");
        return;
      }
      if (data.mode === "needs_embedded_signup") {
        if (!embeddedSignupEnabled) {
          setError("Esta línea necesita Embedded Signup y aún no está habilitado.");
          return;
        }
        setConnectOpen(true);
        return;
      }
      if (data.channel) setChannel(data.channel);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando WhatsApp...
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[.06] p-4 text-sm text-red-300">
        {error || "Línea no encontrada."}
      </div>
    );
  }

  const dirty = (selectedAgentId || "") !== (channel.text_agent_id || "");
  const assignedAgent = agents.find(a => a.id === channel.text_agent_id);

  return (
    <div className="space-y-5">
      <WhatsAppEmbeddedSignupModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onSuccess={load}
        reconnectChannel={channel}
      />

      <WhatsAppChannelConfirmModal
        channel={channel}
        action={confirmAction}
        loading={actionLoading}
        onClose={() => !actionLoading && setConfirmAction(null)}
        onConfirm={() => void runConfirmAction()}
      />

      <div className="rounded-xl border border-white/[.10] bg-white/[.02] p-5">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">WhatsApp Business</p>
            <p className="text-2xl font-mono font-bold text-white break-all mt-0.5">{channel.e164}</p>
            {channel.friendly_name && (
              <p className="text-sm text-gray-400 mt-1">{channel.friendly_name}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Estado</p>
            <p className="text-sm font-medium text-gray-200 mt-0.5">{whatsAppChannelStatusLabel(channel)}</p>
          </div>
        </div>
        {channel.status === "pending" && (
          <div className="mt-4 pt-4 border-t border-white/[.08] flex items-center gap-2 text-xs text-amber-200/90">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            Activando mensajería… Noova configura tu línea automáticamente (1–2 min).
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/[.10] bg-white/[.02] p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-2">Agente de texto</label>
          <NoovaSelect
            value={selectedAgentId}
            onChange={setSelectedAgentId}
            allowEmpty={true}
            emptyLabel="Sin asignar"
            options={agents.map(a => ({ value: a.id, label: a.name }))}
          />
          <p className={`${textMuted} mt-2`}>
            {assignedAgent
              ? `Atiende con: ${assignedAgent.name}`
              : "Asigne un agente para que la IA responda automáticamente."}
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className={`${btnPrimary} disabled:opacity-40`}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
            ) : (
              <><Save className="w-4 h-4" /> Guardar asignación</>
            )}
          </button>
          {!dirty && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
        </div>
      </div>

      <WhatsAppChannelLifecycleSection
        channel={channel}
        embeddedSignupEnabled={embeddedSignupEnabled}
        disconnecting={actionLoading && confirmAction === "disconnect"}
        deleting={actionLoading && confirmAction === "delete"}
        onDisconnect={() => setConfirmAction("disconnect")}
        onReconnect={() => void handleReconnect()}
        onDelete={() => setConfirmAction("delete")}
      />

      <div className="rounded-xl border border-white/[.08] bg-white/[.02] px-5 py-4 text-sm">
        <p className="font-medium text-gray-200 mb-1">Inbox</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Los mensajes entrantes aparecen en el Inbox con canal WhatsApp.
        </p>
        <Link
          href="/dashboard/inbox"
          className="inline-flex items-center gap-1 mt-2 text-xs text-[#a5a5ff] hover:text-white"
        >
          Ir al Inbox <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
