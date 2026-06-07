"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Loader2, Copy, CheckCircle2, Plus, Link2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import type { PhoneNumberRecord } from "@/types/phone-number";
import { btnPrimarySm, btnGhost, textMuted, textSecondary } from "@/lib/brand-ui";
import { ClientLineWizard } from "@/components/telephony/ClientLineWizard";

interface AgentPhoneChannelPanelProps {
  agentId: string;
}

export function AgentPhoneChannelPanel({ agentId }: AgentPhoneChannelPanelProps) {
  const [line, setLine] = useState<PhoneNumberRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/telephony/numbers?agent_id=${agentId}`, { headers });
      const data = await res.json();
      if (res.ok) setLine((data.phone_numbers ?? [])[0] ?? null);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  async function copyNumber() {
    if (!line?.e164) return;
    await navigator.clipboard.writeText(line.e164);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6 max-w-xl space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-5 h-5 text-[#5b5bf6]" />
            <h2 className="text-lg font-semibold text-white">Canal telefónico</h2>
          </div>
          <p className={`text-sm ${textMuted}`}>Línea asignada a este agente.</p>
        </div>

        {line ? (
          <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`text-xs uppercase tracking-wide ${textMuted} mb-1`}>Tu línea Noova</p>
                <p className="text-2xl font-bold text-white font-mono">{line.e164}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                <CheckCircle2 className="w-3.5 h-3.5" /> Activa
              </span>
            </div>
            <button onClick={copyNumber} className={btnPrimarySm}>
              {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/[.12] bg-noova-surface/50 p-8 text-center space-y-4">
            <Phone className="w-10 h-10 text-gray-600 mx-auto" />
            <p className={`text-sm ${textSecondary}`}>Sin línea en este agente</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button onClick={() => setShowWizard(true)} className={btnPrimarySm}>
                <Plus className="w-3.5 h-3.5" /> Solicitar línea
              </button>
              <button onClick={() => setShowWizard(true)} className={btnGhost}>
                <Link2 className="w-3.5 h-3.5" /> Vincular mi número
              </button>
            </div>
          </div>
        )}

        <Link href="/dashboard/agentes-voz/numeros" className={`inline-flex text-xs ${textMuted} hover:text-white`}>
          Ver todas mis líneas →
        </Link>
      </div>

      <ClientLineWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={load}
        voiceAgentId={agentId}
      />
    </>
  );
}
