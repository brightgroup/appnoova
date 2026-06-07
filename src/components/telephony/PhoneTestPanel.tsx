"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Phone, Loader2, Copy, CheckCircle2, Radio, AlertCircle, ArrowDown } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import { btnPrimarySm, btnGhost, textMuted, textSecondary } from "@/lib/brand-ui";
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
  const [listening, setListening] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detected, setDetected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listenStartRef = useRef<string | null>(null);

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
  const canTest = Boolean(selectedLine && selectedTest);

  const stopListening = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!agentId || !selectedLine || !selectedTest) return;
    setDetected(false);
    setListening(true);
    listenStartRef.current = new Date().toISOString();

    pollRef.current = setInterval(async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/voice/agents/calls?agent_id=${agentId}`, { headers });
        const data = await res.json();
        if (!res.ok) return;

        const since = listenStartRef.current;
        const match = (data.calls ?? []).find((c: {
          phone_number: string;
          created_at: string;
          metadata?: { is_test_call?: boolean; direction?: string; to?: string };
        }) => {
          if (!since || c.created_at < since) return false;
          const fromMatch = c.phone_number === selectedTest.e164;
          const toMatch = c.metadata?.to === selectedLine.e164;
          return fromMatch && (toMatch || c.metadata?.direction === "inbound");
        });

        if (match) {
          setDetected(true);
          stopListening();
          onCallDetected?.();
        }
      } catch { /* ignore poll errors */ }
    }, 3000);
  }, [agentId, onCallDetected, selectedLine, selectedTest, stopListening]);

  useEffect(() => () => stopListening(), [stopListening]);

  async function copyDestination() {
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
            Elige la línea de <strong className="text-white">{agentName}</strong> y el celular desde el que llamarás.
          </p>
        </div>

        {/* Número destino — líneas asignadas al agente */}
        <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-5 space-y-3">
          <div>
            <p className={`text-[11px] font-medium ${textMuted} uppercase tracking-wide`}>Número destino</p>
            <p className={`text-xs ${textSecondary} mt-0.5`}>Línea del agente a la que marcarás</p>
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
                <button onClick={copyDestination} className={btnPrimarySm}>
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copiado" : "Copiar destino"}
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
                    Asigna una línea en <strong className="text-white">Canales</strong> para que aparezca aquí.
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

        {/* Número remitente — celular de prueba */}
        <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-5 space-y-3">
          <div>
            <p className={`text-[11px] font-medium ${textMuted} uppercase tracking-wide`}>Número remitente</p>
            <p className={`text-xs ${textSecondary} mt-0.5`}>Celular desde el que harás la llamada de prueba</p>
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
              <p className={`text-sm ${textSecondary}`}>Sin números de prueba</p>
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
              <Radio className={`w-5 h-5 shrink-0 mt-0.5 ${listening ? "text-[#5b5bf6] animate-pulse" : "text-gray-400"}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">
                  {detected ? "¡Llamada detectada!" : listening ? "Esperando tu llamada..." : "Listo para probar"}
                </p>
                <p className={`text-xs ${textSecondary} mt-1 leading-relaxed`}>
                  Desde <span className="font-mono text-white">{selectedTest!.e164}</span> (remitente) llama a{" "}
                  <span className="font-mono text-white">{selectedLine!.e164}</span> (destino). El agente contestará con su saludo.
                </p>
              </div>
            </div>

            {!detected && (
              <div className="flex gap-2">
                {!listening ? (
                  <button onClick={startListening} className={btnPrimarySm}>
                    <Phone className="w-3.5 h-3.5" /> Iniciar escucha
                  </button>
                ) : (
                  <button onClick={stopListening} className={btnGhost}>
                    Cancelar escucha
                  </button>
                )}
              </div>
            )}

            {detected && (
              <p className="text-xs text-emerald-400">
                La llamada quedó registrada en Registro de llamadas.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
