"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Loader2, Save, CheckCircle2, ExternalLink } from "lucide-react";
import { btnPrimary, btnGhost, textMuted } from "@/lib/brand-ui";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import { countryLabel } from "@/lib/telephony/countries";
import { numberUsageLabel } from "@/lib/telephony/number-type-labels";
import type { PhoneNumberRecord } from "@/types/phone-number";
import type { VoiceAgentListItem } from "@/types/voice-agent";

const selectCls =
  "w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50 appearance-none cursor-pointer";

export function LinePhoneConfigPanel({ lineId }: { lineId: string }) {
  const [line, setLine] = useState<PhoneNumberRecord | null>(null);
  const [agents, setAgents] = useState<VoiceAgentListItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const [linesRes, agentsRes] = await Promise.all([
        fetch("/api/telephony/numbers", { headers }),
        fetch("/api/voice/agents", { headers })
      ]);
      const linesData = await linesRes.json();
      const agentsData = await agentsRes.json();

      if (agentsRes.ok) setAgents(agentsData.agents ?? []);

      const found = ((linesData.phone_numbers ?? []) as PhoneNumberRecord[]).find(l => l.id === lineId) ?? null;
      setLine(found);
      setSelectedAgentId(found?.voice_agent_id ?? "");
      setSaved(true);
    } finally {
      setLoading(false);
    }
  }, [lineId]);

  useEffect(() => { load(); }, [load]);

  const assignedAgent = agents.find(a => a.id === line?.voice_agent_id);

  const handleSave = async () => {
    if (!line) return;
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/telephony/numbers", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          id: line.id,
          voice_agent_id: selectedAgentId || null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar la asignación");
        return;
      }
      if (data.phone_number) {
        setLine(data.phone_number as PhoneNumberRecord);
        setSelectedAgentId(data.phone_number.voice_agent_id ?? "");
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando línea...
      </div>
    );
  }

  if (!line) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[.06] p-4 text-sm text-red-300">
        Línea no encontrada.
      </div>
    );
  }

  const dirty = (selectedAgentId || "") !== (line.voice_agent_id || "");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/[.10] bg-white/[.02] p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#5b5bf6]/15 flex items-center justify-center shrink-0">
            <Phone className="w-5 h-5 text-[#a5a5ff]" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Línea telefónica</p>
            <p className="text-2xl font-mono font-bold text-white break-all">{line.e164}</p>
            {line.friendly_name && (
              <p className="text-sm text-gray-400 mt-1">{line.friendly_name}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-2">
            <p className="text-gray-500 mb-0.5">País</p>
            <p className="text-gray-200">{countryLabel(line.country_code)}</p>
          </div>
          <div className="rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-2">
            <p className="text-gray-500 mb-0.5">Uso</p>
            <p className="text-gray-200">{numberUsageLabel(line.number_type ?? "purchased")}</p>
          </div>
          <div className="rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-2 col-span-2">
            <p className="text-gray-500 mb-0.5">Estado</p>
            <p className="text-gray-200 capitalize">{line.status}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/[.10] bg-white/[.02] p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Agente de voz asignado</h2>
          <p className={`text-xs ${textMuted} mt-1 leading-relaxed`}>
            Las llamadas entrantes a este número serán atendidas por el agente que elijas.
          </p>
        </div>

        {assignedAgent && saved && !dirty && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-emerald-300/80 mb-0.5">Actualmente asignado</p>
              <p className="text-sm font-medium text-white">{assignedAgent.name}</p>
            </div>
            <Link
              href={`/dashboard/agentes-voz/configuracion?id=${assignedAgent.id}`}
              className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 shrink-0"
            >
              Ver agente <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
        )}

        <div>
          <label className="block text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            Agente de voz
          </label>
          <select
            value={selectedAgentId}
            onChange={e => {
              setSelectedAgentId(e.target.value);
              setSaved(false);
            }}
            className={selectCls}
          >
            <option value="">Sin asignar</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <Link href="/dashboard/agentes-voz" className="inline-block mt-2 text-[11px] text-[#5b5bf6] hover:text-[#a5a5ff]">
            Gestionar agentes de voz →
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || (saved && !dirty)}
            className={btnPrimary}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved && !dirty ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? "Guardando..." : saved && !dirty ? "Guardado" : "Guardar asignación"}
          </button>
          {dirty && (
            <button
              type="button"
              onClick={() => {
                setSelectedAgentId(line.voice_agent_id ?? "");
                setSaved(true);
              }}
              className={btnGhost}
            >
              Descartar cambios
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
