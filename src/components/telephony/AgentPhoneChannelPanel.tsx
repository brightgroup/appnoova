"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Loader2, Copy, CheckCircle2, Plus, Link2, Unlink } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import type { PhoneNumberRecord } from "@/types/phone-number";
import { btnPrimarySm, btnGhost, textMuted, textSecondary } from "@/lib/brand-ui";
import { ClientLineWizard } from "@/components/telephony/ClientLineWizard";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

interface AgentPhoneChannelPanelProps {
  agentId: string;
  isPremium?: boolean;
}

export function AgentPhoneChannelPanel({ agentId, isPremium = false }: AgentPhoneChannelPanelProps) {
  const [line, setLine] = useState<PhoneNumberRecord | null>(null);
  const [premiumLine, setPremiumLine] = useState<{ e164: string | null; label: string | null; configured: boolean } | null>(null);
  const [availableLines, setAvailableLines] = useState<PhoneNumberRecord[]>([]);
  const [selectedLineId, setSelectedLineId] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      if (isPremium) {
        const res = await fetch("/api/voice/agents/elevenlabs/phone-line", { headers });
        const data = await res.json();
        setPremiumLine(res.ok ? {
          configured: Boolean(data.configured),
          e164: data.e164 ?? null,
          label: data.label ?? null,
        } : { configured: false, e164: null, label: null });
        setLine(null);
        setAvailableLines([]);
        return;
      }

      setPremiumLine(null);
      const [assignedRes, allRes] = await Promise.all([
        fetch(`/api/telephony/numbers?agent_id=${agentId}`, { headers }),
        fetch("/api/telephony/numbers", { headers })
      ]);
      const assignedData = await assignedRes.json();
      const allData = await allRes.json();

      const assigned = (assignedData.phone_numbers ?? [])[0] ?? null;
      const all: PhoneNumberRecord[] = allData.phone_numbers ?? [];

      setLine(assigned);
      const options = assigned
        ? all.filter(l => l.id !== assigned.id)
        : all.filter(l => !l.voice_agent_id);
      setAvailableLines(options);
      if (options.length > 0) setSelectedLineId(options[0].id);
    } finally {
      setLoading(false);
    }
  }, [agentId, isPremium]);

  useEffect(() => { load(); }, [load]);

  async function assignLine(phoneId: string) {
    setAssigning(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/telephony/numbers", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id: phoneId, voice_agent_id: agentId })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo asignar la línea");
        return;
      }
      await load();
    } finally {
      setAssigning(false);
    }
  }

  async function unassignLine() {
    if (!line) return;
    setAssigning(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/telephony/numbers", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id: line.id, voice_agent_id: null })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo desvincular");
        return;
      }
      await load();
    } finally {
      setAssigning(false);
    }
  }

  async function copyNumber() {
    const e164 = isPremium ? premiumLine?.e164 : line?.e164;
    if (!e164) return;
    await navigator.clipboard.writeText(e164);
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
          <p className={`text-sm ${textMuted}`}>
            {isPremium
              ? "Línea premium para llamadas salientes (SIP ElevenLabs)."
              : "Asigna una línea Noova a este agente."}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
        )}

        {isPremium ? (
          premiumLine?.configured && premiumLine.e164 ? (
            <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={`text-xs uppercase tracking-wide ${textMuted} mb-1`}>
                    {premiumLine.label ?? "Línea premium"}
                  </p>
                  <p className="text-2xl font-bold text-white font-mono">{premiumLine.e164}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Activa
                </span>
              </div>
              <button onClick={copyNumber} className={btnPrimarySm}>
                {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
              <p className={`text-xs ${textMuted} leading-relaxed`}>
                Esta línea se configura en el servidor con{" "}
                <code className="text-gray-300">ELEVENLABS_PHONE_NUMBER_ID</code>.
                Úsala en <strong className="text-white">Probar → teléfono</strong>.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[.06] p-6 space-y-3">
              <p className="text-sm font-medium text-amber-100">Línea premium pendiente</p>
              <p className={`text-xs ${textMuted} leading-relaxed`}>
                Importa tu número en ElevenLabs → Phone Numbers y define{" "}
                <code className="text-gray-300">ELEVENLABS_PHONE_NUMBER_ID</code> en el servidor.
              </p>
            </div>
          )
        ) : line ? (
          <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`text-xs uppercase tracking-wide ${textMuted} mb-1`}>Línea asignada</p>
                <p className="text-2xl font-bold text-white font-mono">{line.e164}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                <CheckCircle2 className="w-3.5 h-3.5" /> Activa
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={copyNumber} className={btnPrimarySm}>
                {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
              <button onClick={unassignLine} disabled={assigning} className={btnGhost}>
                {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                Desvincular
              </button>
            </div>

            {availableLines.length > 0 && (
              <div className="pt-4 border-t border-white/[.08] space-y-2">
                <p className={`text-xs ${textMuted}`}>Cambiar a otra línea</p>
                <div className="flex gap-2">
                  <NoovaSelect
                    value={selectedLineId}
                    onChange={setSelectedLineId}
                    allowEmpty={false}
                    className="flex-1"
                    options={availableLines.map(l => ({ value: l.id, label: l.e164 }))}
                  />
                  <button
                    onClick={() => assignLine(selectedLineId)}
                    disabled={assigning || !selectedLineId}
                    className={btnPrimarySm}
                  >
                    Cambiar
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : availableLines.length > 0 ? (
          <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-6 space-y-4">
            <p className={`text-sm ${textSecondary}`}>Selecciona una de tus líneas disponibles:</p>
            <NoovaSelect
              value={selectedLineId}
              onChange={setSelectedLineId}
              allowEmpty={false}
              options={availableLines.map(l => ({ value: l.id, label: l.e164 }))}
            />
            <button
              onClick={() => assignLine(selectedLineId)}
              disabled={assigning || !selectedLineId}
              className={btnPrimarySm}
            >
              {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Asignar a este agente
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/[.12] bg-noova-surface/50 p-8 text-center space-y-4">
            <Phone className="w-10 h-10 text-gray-600 mx-auto" />
            <p className={`text-sm ${textSecondary}`}>Sin líneas disponibles</p>
            <p className={`text-xs ${textMuted}`}>Solicita una línea a Noova o vincula la tuya.</p>
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

        {!isPremium && (
        <Link href="/dashboard/agentes-voz/numeros" className={`inline-flex text-xs ${textMuted} hover:text-white`}>
          Ver todas mis líneas →
        </Link>
        )}
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
