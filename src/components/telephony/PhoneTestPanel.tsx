"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Phone, Loader2, Copy, CheckCircle2, Radio, AlertCircle, RefreshCw, Search } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import {
  btnPrimary, btnPrimarySm, btnIcon, inputSearch,
  registryTableHead, registryTableHeadRow, registryTableRow,
  textMuted, textSecondary
} from "@/lib/brand-ui";
import { formatPhoneDisplay } from "@/lib/telephony/format-phone";
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
  const [lineSearch, setLineSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");

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
        fetch("/api/telephony/test-numbers?active=1", { headers })
      ]);
      const lineData = await lineRes.json();
      const testData = await testRes.json();

      const lines: PhoneNumberRecord[] = lineRes.ok ? (lineData.phone_numbers ?? []) : [];
      const tests: TestPhoneNumberRecord[] = testRes.ok
        ? (testData.test_numbers ?? []).filter((n: TestPhoneNumberRecord) => n.active !== false)
        : [];

      setAgentLines(lines);
      setTestNumbers(tests);
      setSelectedLineId(prev => (prev && lines.some(l => l.id === prev) ? prev : lines[0]?.id ?? null));
      setSelectedTestId(prev => (prev && tests.some(t => t.id === prev) ? prev : tests[0]?.id ?? null));
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const filteredLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    if (!q) return agentLines;
    return agentLines.filter(l => l.e164.includes(q));
  }, [agentLines, lineSearch]);

  const filteredTests = useMemo(() => {
    const q = testSearch.trim().toLowerCase();
    if (!q) return testNumbers;
    return testNumbers.filter(n =>
      n.label.toLowerCase().includes(q) || n.e164.includes(q)
    );
  }, [testNumbers, testSearch]);

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
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-5 h-5 text-[#5b5bf6]" />
            <h2 className="text-lg font-semibold text-white">Probar por teléfono</h2>
          </div>
          <p className={`text-sm ${textSecondary} leading-relaxed max-w-2xl`}>
            El agente <strong className="text-white">{agentName}</strong> llamará desde tu línea Telnyx
            (remitente) al número destinatario que elijas. Los números de prueba están exentos de cargos.
          </p>
        </div>

        {/* Remitente */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-white">Número remitente</p>
              <p className={`text-xs ${textMuted}`}>Línea Noova / Telnyx asignada al agente en Canales</p>
            </div>
            <button onClick={load} className={btnIcon} title="Actualizar">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {agentLines.length > 0 ? (
            <>
              <div className="relative mb-3 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  placeholder="Buscar"
                  value={lineSearch}
                  onChange={e => setLineSearch(e.target.value)}
                  className={inputSearch}
                />
              </div>
              <div className="rounded-xl border border-white/[.10] bg-noova-surface overflow-auto">
                <table className="w-full min-w-[480px] text-xs">
                  <thead className={registryTableHead}>
                    <tr className={registryTableHeadRow}>
                      <th className="px-5 py-3 text-left font-semibold w-8" />
                      <th className="px-4 py-3 text-left font-semibold">Número</th>
                      <th className="px-4 py-3 text-left font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.map(line => {
                      const selected = line.id === selectedLineId;
                      return (
                        <tr
                          key={line.id}
                          onClick={() => setSelectedLineId(line.id)}
                          className={`${registryTableRow} ${selected ? "bg-[#5b5bf6]/10" : ""}`}
                        >
                          <td className="px-5 py-3.5">
                            <span className={`block w-3.5 h-3.5 rounded-full border-2 ${
                              selected ? "border-[#5b5bf6] bg-[#5b5bf6]" : "border-gray-500"
                            }`} />
                          </td>
                          <td className="px-4 py-3.5 font-mono text-sm text-white">
                            {formatPhoneDisplay(line.e164)}
                            {selected && (
                              <span className="ml-2 text-[10px] text-gray-400 font-sans">Actual</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1.5 text-emerald-400">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Activo
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {selectedLine && (
                <button onClick={copySender} className={`${btnPrimarySm} mt-3`}>
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
        </section>

        {/* Destinatario */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-white">Número destinatario</p>
              <p className={`text-xs ${textMuted}`}>Celular de prueba que recibirá la llamada</p>
            </div>
            <Link href="/dashboard/agentes-voz/numeros-prueba" className={btnPrimarySm}>
              Gestionar números
            </Link>
          </div>

          {testNumbers.length > 0 ? (
            <>
              <div className="relative mb-3 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  placeholder="Buscar"
                  value={testSearch}
                  onChange={e => setTestSearch(e.target.value)}
                  className={inputSearch}
                />
              </div>
              <div className="rounded-xl border border-white/[.10] bg-noova-surface overflow-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className={registryTableHead}>
                    <tr className={registryTableHeadRow}>
                      <th className="px-5 py-3 text-left font-semibold w-8" />
                      <th className="px-4 py-3 text-left font-semibold">Nombre</th>
                      <th className="px-4 py-3 text-left font-semibold">Número</th>
                      <th className="px-4 py-3 text-left font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTests.map(test => {
                      const selected = test.id === selectedTestId;
                      return (
                        <tr
                          key={test.id}
                          onClick={() => setSelectedTestId(test.id)}
                          className={`${registryTableRow} ${selected ? "bg-[#5b5bf6]/10" : ""}`}
                        >
                          <td className="px-5 py-3.5">
                            <span className={`block w-3.5 h-3.5 rounded-full border-2 ${
                              selected ? "border-[#5b5bf6] bg-[#5b5bf6]" : "border-gray-500"
                            }`} />
                          </td>
                          <td className="px-4 py-3.5 text-gray-200">{test.label}</td>
                          <td className="px-4 py-3.5 font-mono text-sm text-white">
                            {formatPhoneDisplay(test.e164)}
                            {selected && (
                              <span className="ml-2 text-[10px] text-gray-400 font-sans">Actual</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1.5 text-emerald-400">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Activo
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[.12] p-6 text-center space-y-3">
              <p className={`text-sm ${textSecondary}`}>Sin números destinatarios activos</p>
              <Link href="/dashboard/agentes-voz/numeros-prueba" className={btnPrimary}>
                Nuevo número de prueba
              </Link>
            </div>
          )}
        </section>

        {canTest && (
          <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Radio className={`w-5 h-5 shrink-0 mt-0.5 ${calling ? "text-[#5b5bf6] animate-pulse" : "text-gray-400"}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">
                  {success ? "Llamada iniciada" : calling ? "Marcando..." : "Listo para probar"}
                </p>
                <p className={`text-xs ${textSecondary} mt-1 leading-relaxed`}>
                  Desde <span className="font-mono text-white">{formatPhoneDisplay(selectedLine!.e164)}</span> hacia{" "}
                  <span className="font-mono text-white">{formatPhoneDisplay(selectedTest!.e164)}</span>.
                  Contesta en tu celular para escuchar al agente.
                </p>
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            {!success && (
              <button onClick={startTestCall} disabled={calling} className={btnPrimary}>
                {calling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
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
