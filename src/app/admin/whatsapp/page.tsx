"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, MessageCircle, Plus, Copy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/telephony-api";
import { btnPrimary, btnGhost, registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell, registryTableCell, textMuted } from "@/lib/brand-ui";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

export default function AdminWhatsAppPage() {
  const [channels, setChannels] = useState<WhatsAppChannelRecord[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; nombre: string }[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [userId, setUserId] = useState("");
  const [e164, setE164] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [messagingServiceSid, setMessagingServiceSid] = useState("");
  const [activate, setActivate] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [chRes, usersRes] = await Promise.all([
      authFetch("/api/admin/whatsapp/channels"),
      supabase.from("users").select("id, email, nombre").order("email")
    ]);
    const chData = await chRes.json();
    if (chRes.ok) {
      setChannels(chData.channels ?? []);
      setWebhookUrl(String(chData.webhook_url ?? ""));
    } else {
      setError(chData.error || "Error al cargar");
    }
    if (usersRes.data) setUsers(usersRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/whatsapp/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          e164,
          friendly_name: friendlyName || undefined,
          twilio_messaging_service_sid: messagingServiceSid || undefined,
          status: activate ? "active" : "pending"
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo registrar");
        return;
      }
      setE164("");
      setFriendlyName("");
      setMessagingServiceSid("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, status: string) => {
    const next = status === "active" ? "pending" : "active";
    const res = await authFetch("/api/admin/whatsapp/channels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next })
    });
    if (res.ok) load();
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white min-h-0">
      <div className="border-b border-white/[.08] px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">WhatsApp (Fase 0 — Twilio)</h1>
            <p className="text-xs text-gray-500">Registrar líneas manualmente y copiar webhook</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8 max-w-4xl">
        {webhookUrl && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[.06] p-4 space-y-2">
            <p className="text-sm font-medium text-emerald-300">Webhook para Twilio Console</p>
            <p className={`${textMuted} text-xs`}>
              Messaging → WhatsApp Senders → su número → &quot;When a message comes in&quot; → HTTP POST
            </p>
            <div className="flex gap-2">
              <code className="flex-1 text-xs break-all bg-black/30 rounded-lg px-3 py-2">{webhookUrl}</code>
              <button type="button" onClick={copyWebhook} className={btnGhost}>
                <Copy className="w-4 h-4" /> {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleCreate} className="rounded-xl border border-white/[.10] bg-white/[.02] p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" /> Registrar línea WhatsApp
          </h2>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Cliente (corredor)</label>
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              required
              className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Seleccionar usuario</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nombre || u.email} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Número E.164 (Twilio WA)</label>
              <input
                value={e164}
                onChange={e => setE164(e.target.value)}
                placeholder="+573001234567"
                required
                className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nombre amigable</label>
              <input
                value={friendlyName}
                onChange={e => setFriendlyName(e.target.value)}
                placeholder="WhatsApp Noova Demo"
                className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Messaging Service SID (opcional)</label>
            <input
              value={messagingServiceSid}
              onChange={e => setMessagingServiceSid(e.target.value)}
              placeholder="MGxxxxxxxx"
              className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={activate} onChange={e => setActivate(e.target.checked)} />
            Activar inmediatamente (recibir mensajes)
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Registrar línea"}
          </button>
        </form>

        <div>
          <h2 className="text-sm font-semibold mb-3">Líneas registradas</h2>
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          ) : channels.length === 0 ? (
            <p className="text-sm text-gray-500">Sin líneas registradas.</p>
          ) : (
            <table className={`${registryTable} min-w-full`}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={registryTableHeadCell}>Número</th>
                  <th className={registryTableHeadCell}>Usuario</th>
                  <th className={registryTableHeadCell}>Estado</th>
                  <th className={registryTableHeadCell} />
                </tr>
              </thead>
              <tbody>
                {channels.map(ch => {
                  const u = users.find(x => x.id === ch.user_id);
                  return (
                    <tr key={ch.id}>
                      <td className={`${registryTableCell} font-mono text-sm`}>
                        <div className="flex items-center gap-2">
                          <MessageCircle className="w-4 h-4 text-emerald-400" />
                          {ch.e164}
                        </div>
                      </td>
                      <td className={`${registryTableCell} text-sm`}>
                        {u?.email ?? ch.user_id.slice(0, 8)}
                      </td>
                      <td className={registryTableCell}>{ch.status}</td>
                      <td className={registryTableCell}>
                        <button
                          type="button"
                          onClick={() => toggleActive(ch.id, ch.status)}
                          className={btnGhost}
                        >
                          {ch.status === "active" ? "Desactivar" : "Activar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
