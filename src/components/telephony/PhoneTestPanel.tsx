"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Phone, Loader2, Copy, CheckCircle2, Radio, AlertCircle } from "lucide-react";
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
  const [line, setLine] = useState<PhoneNumberRecord | null>(null);
  const [testNumbers, setTestNumbers] = useState<TestPhoneNumberRecord[]>([]);
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
      if (lineRes.ok) setLine((lineData.phone_numbers ?? [])[0] ?? null);
      if (testRes.ok) {
        const nums = testData.test_numbers ?? [];
        setTestNumbers(nums);
        setSelectedTestId(prev => prev ?? nums[0]?.id ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const selectedTest = testNumbers.find(n => n.id === selectedTestId) ?? null;

  const stopListening = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!agentId || !line) return;
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
          metadata?: { is_test_call?: boolean; direction?: string };
        }) => {
          if (!since || c.created_at < since) return false;
          const fromTest = selectedTest && c.phone_number === selectedTest.e164;
          const isInbound = c.metadata?.direction === "inbound" || c.metadata?.is_test_call;
          return fromTest || isInbound;
        });

        if (match) {
          setDetected(true);
          stopListening();
          onCallDetected?.();
        }
      } catch { /* ignore poll errors */ }
    }, 3000);
  }, [agentId, line, onCallDetected, selectedTest, stopListening]);

  useEffect(() => () => stopListening(), [stopListening]);

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

  if (!agentId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Guarda el agente antes de probar por teléfono.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-5 h-5 text-[#5b5bf6]" />
            <h2 className="text-lg font-semibold text-white">Probar por teléfono</h2>
          </div>
          <p className={`text-sm ${textMuted}`}>
            Llama al número asignado a <strong className="text-white">{agentName}</strong> desde tu celular de prueba.
          </p>
        </div>

        {!line ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[.06] p-6 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-100">Sin línea asignada</p>
                <p className={`text-xs ${textMuted} mt-1`}>
                  Asigna un número en la pestaña <strong className="text-white">Canales</strong> antes de probar por teléfono.
                </p>
                <Link href={`/dashboard/agentes-voz/configuracion?id=${agentId}&tab=canales`} className="inline-block mt-3 text-xs text-[#5b5bf6] hover:underline">
                  Ir a Canales →
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-6 space-y-4">
            <div>
              <p className={`text-xs uppercase tracking-wide ${textMuted} mb-1`}>Llama a este número</p>
              <p className="text-3xl font-bold text-white font-mono">{line.e164}</p>
            </div>
            <button onClick={copyNumber} className={btnPrimarySm}>
              {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado" : "Copiar número"}
            </button>
          </div>
        )}

        {testNumbers.length > 0 ? (
          <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-5">
            <label className={`block text-[11px] font-medium ${textMuted} mb-1.5 uppercase tracking-wide`}>
              Llamarás desde
            </label>
            <select
              value={selectedTestId ?? ""}
              onChange={e => setSelectedTestId(e.target.value)}
              className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
            >
              {testNumbers.map(n => (
                <option key={n.id} value={n.id}>{n.label} · {n.e164}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/[.12] bg-noova-surface/50 p-6 text-center space-y-2">
            <p className={`text-sm ${textSecondary}`}>No tienes números de prueba</p>
            <p className={`text-xs ${textMuted}`}>
              Agrégalos en{" "}
              <Link href="/dashboard/agentes-voz/numeros-prueba" className="text-[#5b5bf6] hover:underline">
                Números de prueba
              </Link>{" "}
              y vuelve aquí para probar.
            </p>
          </div>
        )}

        {line && selectedTest && (
          <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Radio className={`w-5 h-5 shrink-0 mt-0.5 ${listening ? "text-[#5b5bf6] animate-pulse" : "text-gray-400"}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">
                  {detected ? "¡Llamada detectada!" : listening ? "Esperando tu llamada..." : "Listo para probar"}
                </p>
                <p className={`text-xs ${textSecondary} mt-1 leading-relaxed`}>
                  Desde <span className="font-mono text-white">{selectedTest.e164}</span> llama a{" "}
                  <span className="font-mono text-white">{line.e164}</span>. El agente contestará con su saludo.
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
