"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Loader2, Copy, CheckCircle2, Radio, AlertCircle, ArrowDown } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import { btnPrimarySm, textMuted, textSecondary } from "@/lib/brand-ui";
import type { PhoneNumberRecord } from "@/types/phone-number";
import type { TestPhoneNumberRecord } from "@/types/test-phone-number";

interface PhoneTestPanelProps {
  agentId: string | null;
  agentName: string;
  onCallDetected?: () => void;
}

export function PhoneTestPanel({ agentId, agentName, onCallDetected }: PhoneTestPanelProps) {
  const [agentLines, setAgentLines] = useState<PhoneNumberRecord[]>([]);
  const [testNumbers, setTestNumbers] = useState<TestPhoneNumberRecord[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!agentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [lineRes, testRes] = await Promise.all([
        fetch(`/api/telephony/numbers?agent_id=${agentId}`, { headers }),
        fetch("/api/telephony/test-numbers", { headers })
      ]);
      const lineData = await lineRes.json();
      const testData = await testRes.json();

      const lines: PhoneNumberRecord[] = lineRes.ok ? (lineData.phone_numbers ?? []) : [];
      const tests: TestPhoneNumberRecord[] = testRes.ok ? (testData.test_numbers ?? []) : [];

      setAgentLines(lines);
      setTestNumbers(tests);
      setSelectedLineId(prev => prev ?? lines[0]?.id ?? null);
      setSelectedTestId(prev => prev ?? tests[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const selectedLine = agentLines.find(l => l.id === selectedLineId) ?? null;
  const selectedTest = testNumbers.find(n => n.id === selectedTestId) ?? null;
  const canTest = Boolean(agentId && selectedLine && selectedTest);

  async function startTestCall() {
    if (!canTest) return;
    setCalling(true);
    setError("");
    setSuccess(false);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/telephony/test-call", {
        method: "POST",
        headers,
        body: JSON.stringify({
          voice_agent_id: agentId,
          phone_number_id: selectedLine!.id,
          test_number_id: selectedTest!.id
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar la llamada");
        return;
      }
      setSuccess(true);
      onCallDetected?.();
    } catch {
      setError("Error de red al marcar");
    } finally {
      setCalling(false);
    }
  }

  async function copySender() {
    if (!selectedLine?.e164) return;
    await navigator.clipboard.writeText(selectedLine.e164);
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

  if (!agentId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Guarda el agente antes de probar por teléfono.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-5 h-5 text-[#5b5bf6]" />
            <h2 className="text-lg font-semibold text-white">Probar por teléfono</h2>
          </div>
          <p className={`text-sm ${textMuted}`}>
            El agente <strong className="text-white">{agentName}</strong> llamará desde tu línea Telnyx al número destinatario.
          </p>
        </div>

        {/* Remitente — línea Telnyx asignada al agente */}
        <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-5 space-y-3">
          <div>
            <p className={`text-[11px] font-medium ${textMuted} uppercase tracking-wide`}>Número remitente</p>
            <p className={`text-xs ${textSecondary} mt-0.5`}>Línea Noova / Telnyx desde la que sale la llamada</p>
          </div>

          {agentLines.length > 0 ? (
            <>
              <select
                value={selectedLineId ?? ""}
                onChange={e => setSelectedLineId(e.target.value)}
                className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-violet-500/50"
              >
                {agentLines.map(l => (
                  <option key={l.id} value={l.id}>{l.e164}</option>
                ))}
              </select>
              {selectedLine && (
                <button onClick={copySender} className={btnPrimarySm}>
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copiado" : "Copiar remitente"}
                </button>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[.06] p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-100">Sin línea asignada a este agente</p>
                  <p className={`text-xs ${textMuted} mt-1`}>
                    Asigna una línea Telnyx en <strong className="text-white">Canales</strong>.
                  </p>
                  <Link
                    href={`/dashboard/agentes-voz/configuracion?id=${agentId}&tab=canales`}
                    className="inline-block mt-2 text-xs text-[#5b5bf6] hover:underline"
                  >
                    Ir a Canales →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <ArrowDown className="w-4 h-4 text-gray-500" />
        </div>

        {/* Destinatario — número de prueba */}
        <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-5 space-y-3">
          <div>
            <p className={`text-[11px] font-medium ${textMuted} uppercase tracking-wide`}>Número destinatario</p>
            <p className={`text-xs ${textSecondary} mt-0.5`}>Celular de prueba que recibirá la llamada del agente</p>
          </div>

          {testNumbers.length > 0 ? (
            <select
              value={selectedTestId ?? ""}
              onChange={e => setSelectedTestId(e.target.value)}
              className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50"
            >
              {testNumbers.map(n => (
                <option key={n.id} value={n.id}>{n.label} · {n.e164}</option>
              ))}
            </select>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[.12] p-4 text-center space-y-1">
              <p className={`text-sm ${textSecondary}`}>Sin números destinatarios</p>
              <p className={`text-xs ${textMuted}`}>
                Créalos en{" "}
                <Link href="/dashboard/agentes-voz/numeros-prueba" className="text-[#5b5bf6] hover:underline">
                  Números de prueba
                </Link>
              </p>
            </div>
          )}
        </div>

        {canTest && (
          <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Radio className={`w-5 h-5 shrink-0 mt-0.5 ${calling ? "text-[#5b5bf6] animate-pulse" : "text-gray-400"}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">
                  {success ? "Llamada iniciada" : calling ? "Marcando..." : "Listo para probar"}
                </p>
                <p className={`text-xs ${textSecondary} mt-1 leading-relaxed`}>
                  Desde <span className="font-mono text-white">{selectedLine!.e164}</span> (remitente) hacia{" "}
                  <span className="font-mono text-white">{selectedTest!.e164}</span> (destinatario).
                  Contesta en tu celular para escuchar al agente.
                </p>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            {!success && (
              <button onClick={startTestCall} disabled={calling} className={btnPrimarySm}>
                {calling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
                {calling ? "Marcando..." : "Iniciar llamada de prueba"}
              </button>
            )}

            {success && (
              <p className="text-xs text-emerald-400">
                La llamada salió desde tu línea Telnyx. Revisa el registro cuando contestes.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
