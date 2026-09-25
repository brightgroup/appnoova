"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Facebook, Instagram, Link2, MoreVertical, Unplug } from "lucide-react";
import {
  btnPrimary,
  btnIconSm,
  accentFocus,
  registryTable,
  registryTableHead,
  registryTableHeadRow,
  registryTableHeadCell,
  registryTableCellFirst,
  registryTableCell,
  registryTableCellRight,
  registryTableEmpty
} from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import { MetaMessagingConnectModal } from "@/components/meta-messaging/MetaMessagingConnectModal";
import { getAuthHeaders } from "@/lib/text-agents-api";
import type { MetaMessagingChannelPublic } from "@/lib/meta-messaging/channel-public";
import type { TextAgentListItem } from "@/types/text-agent";

function channelLabel(ch: MetaMessagingChannelPublic): string {
  if (ch.platform === "instagram") return ch.ig_username ? `@${ch.ig_username}` : "Instagram";
  return ch.page_name || "Página de Facebook";
}

export default function MessengerInstagramPage() {
  const [channels, setChannels] = useState<MetaMessagingChannelPublic[]>([]);
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbReady, setDbReady] = useState(true);
  const [search, setSearch] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [menuChannelId, setMenuChannelId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [chRes, agentsRes] = await Promise.all([
        fetch("/api/meta-messaging/channels", { headers }),
        fetch("/api/text/agents", { headers })
      ]);
      const chData = await chRes.json();
      const agentsData = await agentsRes.json();
      if (chRes.ok) {
        setChannels(chData.channels ?? []);
        setDbReady(chData.dbReady !== false);
      }
      if (agentsRes.ok) setAgents(agentsData.agents ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const changeAgent = async (channel: MetaMessagingChannelPublic, textAgentId: string) => {
    setSavingId(channel.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/meta-messaging/channels/${channel.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ text_agent_id: textAgentId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cambiar el agente");
      setChannels(prev => prev.map(c => (c.id === channel.id ? data.channel : c)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo cambiar el agente");
    } finally {
      setSavingId(null);
    }
  };

  const disconnect = async (channel: MetaMessagingChannelPublic) => {
    setMenuChannelId(null);
    const ok = window.confirm(
      `¿Desconectar ${channelLabel(channel)}? Dejarán de llegar mensajes nuevos a Noova. Las conversaciones anteriores se conservan.`
    );
    if (!ok) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/meta-messaging/channels/${channel.id}`, { method: "DELETE", headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo desconectar");
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo desconectar");
    }
  };

  const agentMap = useMemo(() => new Map(agents.map(a => [a.id, a.name])), [agents]);

  const filtered = channels.filter(ch => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const agent = ch.text_agent_id ? agentMap.get(ch.text_agent_id) ?? "" : "";
    return [channelLabel(ch), ch.page_name ?? "", agent].some(v => v.toLowerCase().includes(q));
  });

  return (
    <ChannelListPage
      title="Messenger e Instagram"
      description="Atiende los mensajes de tu página de Facebook y de Instagram Direct desde el inbox de Noova, con tu agente de IA."
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar página, cuenta o agente"
      onRefresh={load}
      refreshing={loading}
      action={
        <button onClick={() => setConnectOpen(true)} className={`${btnPrimary} py-2`}>
          <Link2 className="w-4 h-4" /> Conectar
        </button>
      }
    >
      <MetaMessagingConnectModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onSuccess={load}
      />

      {!dbReady && (
        <div className="mx-6 mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Falta la migración 156_meta_messaging_channels.sql en Supabase.
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={registryTableEmpty}>
          <div className="flex justify-center gap-2 mb-3">
            <Facebook className="w-9 h-9 text-[#99c9ff]/60" />
            <Instagram className="w-9 h-9 text-pink-400/60" />
          </div>
          <p className="text-sm text-gray-300 mb-2 max-w-md mx-auto">
            {search
              ? "No hay resultados"
              : "Conecta tu página de Facebook y su Instagram en un par de clics. Sin costo por mensaje de parte de Meta."}
          </p>
          {!search && (
            <button onClick={() => setConnectOpen(true)} className={`${btnPrimary} py-2 mt-3`}>
              <Link2 className="w-4 h-4" /> Conectar Messenger e Instagram
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 px-6">
          <table className={`${registryTable} min-w-[760px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className={registryTableHeadCell}>Canal</th>
                <th className={registryTableHeadCell}>Página</th>
                <th className={registryTableHeadCell}>Agente</th>
                <th className={registryTableHeadCell}>Estado</th>
                <th className={registryTableHeadCell} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(ch => (
                <tr key={ch.id}>
                  <td className={registryTableCellFirst}>
                    <div className="flex items-center gap-3">
                      {ch.platform === "instagram" ? (
                        <Instagram className="w-4 h-4 text-pink-400" />
                      ) : (
                        <Facebook className="w-4 h-4 text-[#99c9ff]" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{channelLabel(ch)}</p>
                        <p className="text-[11px] text-gray-400">
                          {ch.platform === "instagram" ? "Instagram Direct" : "Messenger"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={registryTableCell}>{ch.page_name || "—"}</td>
                  <td className={registryTableCell}>
                    <select
                      value={ch.text_agent_id ?? ""}
                      disabled={savingId === ch.id}
                      onChange={e => void changeAgent(ch, e.target.value)}
                      className={`px-2 py-1 rounded-lg bg-white/[.04] border border-white/[.08] text-white text-sm ${accentFocus} disabled:opacity-50`}
                    >
                      {!ch.text_agent_id && <option value="">Sin asignar</option>}
                      {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className={registryTableCell}>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-500/15 text-emerald-300">
                      Activo
                    </span>
                  </td>
                  <td className={registryTableCellRight}>
                    <NoovaAnchoredMenu
                      open={menuChannelId === ch.id}
                      onClose={() => setMenuChannelId(null)}
                      anchor={
                        <button
                          type="button"
                          className={btnIconSm}
                          onClick={() => setMenuChannelId(prev => (prev === ch.id ? null : ch.id))}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      }
                    >
                      <NoovaListMenuItem onClick={() => { setMenuChannelId(null); setConnectOpen(true); }}>
                        <span className="flex items-center gap-2">
                          <Link2 className="w-3.5 h-3.5" /> Reconectar
                        </span>
                      </NoovaListMenuItem>
                      <NoovaListMenuItem danger onClick={() => void disconnect(ch)}>
                        <span className="flex items-center gap-2">
                          <Unplug className="w-3.5 h-3.5" /> Desconectar
                        </span>
                      </NoovaListMenuItem>
                    </NoovaAnchoredMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChannelListPage>
  );
}
