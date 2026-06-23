"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Loader2, Save, CheckCircle2, Copy, ExternalLink, Unplug } from "lucide-react";
import { btnPrimary, btnGhost, textMuted } from "@/lib/brand-ui";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { whatsAppChannelStatusLabel } from "@/lib/whatsapp/channel-status";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import type { TextAgentListItem } from "@/types/text-agent";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

function statusLabel(channel: WhatsAppChannelRecord): string {
  return whatsAppChannelStatusLabel(channel);
}

export function WhatsAppChannelConfigPanel({ channelId }: { channelId: string }) {
  const [channel, setChannel] = useState<WhatsAppChannelRecord | null>(null);
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const [chRes, agentsRes, listRes] = await Promise.all([
        fetch(`/api/whatsapp/channels/${channelId}`, { headers }),
        fetch("/api/text/agents", { headers }),
        fetch("/api/whatsapp/channels", { headers })
      ]);
      const chData = await chRes.json();
      const agentsData = await agentsRes.json();
      const listData = await listRes.json();

      if (agentsRes.ok) setAgents(agentsData.agents ?? []);
      if (listRes.ok && listData.webhook_url) setWebhookUrl(String(listData.webhook_url));

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

  const handleDisconnect = async () => {
    if (!channel) return;
    const ok = window.confirm(
      "¿Desconectar esta línea en Noova?\n\nNo elimina el número en Meta ni Twilio — solo deja de recibir y enviar mensajes desde Noova. Podrás volver a conectarla con «Conectar WhatsApp»."
    );
    if (!ok) return;

    setDisconnecting(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
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
    } finally {
      setDisconnecting(false);
    }
  };

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    <div className="space-y-6">
      <div className="rounded-xl border border-white/[.10] bg-white/[.02] p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">WhatsApp Business</p>
            <p className="text-2xl font-mono font-bold text-white break-all">{channel.e164}</p>
            {channel.friendly_name && (
              <p className="text-sm text-gray-400 mt-1">{channel.friendly_name}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-2">
            <p className="text-gray-500 mb-0.5">Estado</p>
            <p className="text-gray-200">{statusLabel(channel)}</p>
          </div>
          <div className="rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-2">
            <p className="text-gray-500 mb-0.5">Proveedor</p>
            <p className="text-gray-200 capitalize">{channel.provider === "meta" ? "Meta directo" : channel.provider}</p>
          </div>
        </div>

        {channel.status === "active" && (
          <p className="text-xs text-amber-400/90 leading-relaxed">
            «Activo» significa que Noova tiene registrada la conexión. Si eliminaste el número en Twilio o Meta,
            desconéctala aquí para que el estado coincida.
          </p>
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

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className={`${btnPrimary} disabled:opacity-40`}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
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

      {webhookUrl && channel.provider === "twilio" && (
        <div className="rounded-xl border border-white/[.10] bg-white/[.02] p-5 space-y-3">
          <p className="text-xs font-semibold text-gray-300">Webhook Twilio (administrador)</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            URL para Twilio Console → WhatsApp sender → &quot;When a message comes in&quot;.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 text-[11px] text-gray-300 bg-black/30 rounded-lg px-3 py-2 break-all">
              {webhookUrl}
            </code>
            <button type="button" onClick={copyWebhook} className={btnGhost}>
              <Copy className="w-4 h-4" />
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      {channel.provider === "meta" && (
        <div className="rounded-xl border border-white/[.10] bg-white/[.02] p-5 space-y-2">
          <p className="text-xs font-semibold text-gray-300">Webhook Meta</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Configurado en Meta → WhatsApp → Configuración. URL de producción:
            <code className="block mt-2 text-[11px] text-gray-300 bg-black/30 rounded-lg px-3 py-2 break-all">
              https://app.noova360.com/api/webhooks/meta/whatsapp
            </code>
          </p>
        </div>
      )}

      {channel.status === "active" && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[.04] p-5">
          <p className="text-sm font-medium text-red-300 mb-2">Desconectar línea</p>
          <p className="text-xs text-gray-400 mb-4 leading-relaxed">
            Marca la línea como desconectada en Noova. Úsalo cuando hayas eliminado el número en Meta/Twilio
            o quieras migrar a otra integración.
          </p>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className={`${btnGhost} border border-red-500/30 text-red-300 hover:bg-red-500/10`}
          >
            {disconnecting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Desconectando…</>
            ) : (
              <><Unplug className="w-4 h-4" /> Desconectar en Noova</>
            )}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[.06] p-4 text-sm text-gray-300">
        <p className="font-medium text-emerald-300 mb-1">Conversaciones en Inbox</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          Los mensajes de WhatsApp aparecen en el Inbox con canal &quot;WhatsApp&quot;.
          Asigne la conversación a un humano para responder manualmente; si está en modo IA, el agente responde solo.
        </p>
        <Link
          href="/dashboard/inbox"
          className="inline-flex items-center gap-1 mt-3 text-xs text-emerald-400 hover:text-emerald-300"
        >
          Ir al Inbox <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
