"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Loader2, X } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { supabase } from "@/lib/supabase";
import { btnPrimary } from "@/lib/brand-ui";

interface AdminTransferLineModalProps {
  open: boolean;
  line: { id: string; e164: string; clientName?: string | null } | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface UserOption {
  id: string;
  email: string;
  nombre: string;
}

interface AgentOption {
  id: string;
  name: string;
  voice_provider: string;
}

export function AdminTransferLineModal({
  open,
  line,
  onClose,
  onSuccess,
}: AdminTransferLineModalProps) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setTargetUserId("");
    setAgentId("");
    void supabase
      .from("users")
      .select("id, email, nombre")
      .order("nombre")
      .then(({ data }) => setUsers(data ?? []));
  }, [open]);

  const loadAgents = useCallback(async (userId: string) => {
    if (!userId) {
      setAgents([]);
      setAgentId("");
      return;
    }
    setLoadingAgents(true);
    const res = await authFetch(`/api/admin/telephony/agents?user_id=${encodeURIComponent(userId)}`);
    const json = await res.json();
    setLoadingAgents(false);
    if (res.ok) {
      const list = (json.agents ?? []) as AgentOption[];
      setAgents(list);
      setAgentId(list[0]?.id ?? "");
    } else {
      setAgents([]);
      setAgentId("");
    }
  }, []);

  useEffect(() => {
    if (targetUserId) void loadAgents(targetUserId);
    else {
      setAgents([]);
      setAgentId("");
    }
  }, [targetUserId, loadAgents]);

  async function handleTransfer() {
    if (!line || !targetUserId) return;
    if (!window.confirm(`¿Transferir ${line.e164} al cliente seleccionado?`)) return;

    setBusy(true);
    setError("");
    const res = await authFetch("/api/admin/telephony/numbers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: line.id,
        user_id: targetUserId,
        voice_agent_id: agentId || null,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo transferir la línea");
      return;
    }
    onSuccess();
    onClose();
  }

  if (!open || !line) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-white/[.12] bg-[#12121a] shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[.08]">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-[#5b5bf6]" />
            <h2 className="text-sm font-semibold text-white">Transferir línea</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-400">
            Mueve <span className="font-mono text-white">{line.e164}</span>
            {line.clientName ? (
              <>
                {" "}
                de <span className="text-gray-200">{line.clientName}</span>
              </>
            ) : null}{" "}
            a otro cliente. Se resincroniza ElevenLabs si el agente destino es premium.
          </p>

          <label className="block space-y-1.5">
            <span className="text-xs text-gray-400">Cliente destino</span>
            <select
              value={targetUserId}
              onChange={e => setTargetUserId(e.target.value)}
              className="w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50"
            >
              <option value="">Seleccionar…</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nombre || u.email} ({u.email})
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs text-gray-400">Agente de voz (opcional)</span>
            <select
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              disabled={!targetUserId || loadingAgents}
              className="w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50 disabled:opacity-50"
            >
              <option value="">Sin agente asignado</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.voice_provider === "elevenlabs" ? "premium" : "estándar"})
                </option>
              ))}
            </select>
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[.08]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleTransfer()}
            disabled={busy || !targetUserId}
            className={`${btnPrimary} gap-2 disabled:opacity-50`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            {busy ? "Transfiriendo…" : "Transferir"}
          </button>
        </div>
      </div>
    </div>
  );
}
