"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Phone, Loader2, Copy, CheckCircle2, Radio, AlertCircle, ArrowLeft } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import {
  btnPrimary, btnPrimarySm, btnGhost,
  registryTable, registryTableWrap, registryTableHead, registryTableHeadRow,
  registryTableHeadCell, registryTableRowClickable, registryTableCell, registryTableCellFirst,
  registryTableLoading, textMuted, textSecondary
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { formatPhoneDisplay } from "@/lib/telephony/format-phone";
import type { PhoneNumberRecord } from "@/types/phone-number";
import type { TestPhoneNumberRecord } from "@/types/test-phone-number";
import type { VoiceProvider } from "@/types/voice-agent";

type CallPhase = "dialing" | "ringing" | "answered" | "speaking" | "connected" | "ended" | "failed";

interface PremiumLineInfo {
  configured: boolean;
  e164: string | null;
  label: string | null;
  available_numbers?: { phone_number_id: string; phone_number: string; label: string }[];
}

interface ActiveCall {
  callId: string;
  callControlId: string;
  from: string;
  to: string;
  agentName: string;
  phase: CallPhase;
  statusLabel: string;
  error?: string;
  durationSec: number;
}

interface PhoneTestPanelProps {
  agentId: string | null;
  agentName: string;
  voiceProvider?: VoiceProvider;
  onCallDetected?: () => void;
}

const PHASE_LABEL: Record<CallPhase, string> = {
  dialing: "Marcando",
  ringing: "Sonando",
  answered: "Contestada",
  speaking: "Agente hablando",
  connected: "En llamada",
  ended: "Finalizada",
  failed: "Error"
};

const CONNECTED_PHASES: CallPhase[] = ["answered", "speaking", "connected", "ended"];

function phaseColor(phase: CallPhase): string {
  if (phase === "failed") return "bg-red-400";
  if (phase === "ended") return "bg-gray-500";
  if (phase === "speaking") return "bg-[#5b5bf6] animate-pulse";
  if (phase === "connected" || phase === "answered") return "bg-emerald-400";
  return "bg-amber-400 animate-pulse";
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PhoneTestPanel({ agentId, agentName, voiceProvider = "google", onCallDetected }: PhoneTestPanelProps) {
  const isPremium = voiceProvider === "elevenlabs";
  const [agentLines, setAgentLines] = useState<PhoneNumberRecord[]>([]);
  const [premiumLine, setPremiumLine] = useState<PremiumLineInfo | null>(null);
  const [testNumbers, setTestNumbers] = useState<TestPhoneNumberRecord[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [lineSearch, setLineSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!agentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const testRes = await fetch("/api/telephony/test-numbers?active=1", { headers });
      const testData = await testRes.json();

      const tests: TestPhoneNumberRecord[] = testRes.ok
        ? (testData.test_numbers ?? []).filter((n: TestPhoneNumberRecord) => n.active !== false)
        : [];

      if (isPremium) {
        setAgentLines([]);
        setSelectedLineId(null);
        const lineRes = await fetch("/api/voice/agents/elevenlabs/phone-line", { headers });
        const lineData = await lineRes.json();
        setPremiumLine(lineRes.ok ? {
          configured: Boolean(lineData.configured),
          e164: lineData.e164 ?? null,
          label: lineData.label ?? null,
          available_numbers: lineData.available_numbers ?? [],
        } : { configured: false, e164: null, label: null, available_numbers: [] });
      } else {
        setPremiumLine(null);
        const lineRes = await fetch(`/api/telephony/numbers?agent_id=${agentId}`, { headers });
        const lineData = await lineRes.json();
        const lines: PhoneNumberRecord[] = lineRes.ok ? (lineData.phone_numbers ?? []) : [];
        setAgentLines(lines);
        setSelectedLineId(prev => (prev && lines.some(l => l.id === prev) ? prev : lines[0]?.id ?? null));
      }

      setTestNumbers(tests);
      setSelectedTestId(prev => (prev && tests.some(t => t.id === prev) ? prev : tests[0]?.id ?? null));
    } finally {
      setLoading(false);
    }
  }, [agentId, isPremium]);

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
  const premiumLineReady = isPremium && Boolean(premiumLine?.configured);
  const canTest = Boolean(
    agentId
    && selectedTest
    && (isPremium ? premiumLineReady : selectedLine)
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const pollStatus = useCallback(async (callControlId: string) => {
    try {
      const headers = await getAuthHeaders();
      const statusUrl = isPremium
        ? `/api/voice/agents/elevenlabs/call-status?conversation_id=${encodeURIComponent(callControlId)}`
        : `/api/telephony/test-call/status?call_control_id=${encodeURIComponent(callControlId)}`;
      const res = await fetch(statusUrl, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setActiveCall(prev => {
        if (!prev || prev.callControlId !== callControlId) return prev;
        const phase = (data.phase ?? prev.phase) as CallPhase;
        return {
          ...prev,
          phase,
          statusLabel: data.status_label ?? PHASE_LABEL[phase],
          error: data.error,
          durationSec: data.duration_sec ?? 0
        };
      });
      if (data.phase === "ended" || data.phase === "failed") {
        stopPolling();
        try {
          const finalizeUrl = isPremium
            ? "/api/voice/agents/elevenlabs/call-status"
            : "/api/telephony/test-call/finalize";
          const finalizeBody = isPremium
            ? { conversation_id: callControlId }
            : { call_control_id: callControlId };
          await fetch(finalizeUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(finalizeBody)
          });
        } catch {
          /* ignore */
        }
        onCallDetected?.();
      }
    } catch {
      /* ignore transient poll errors */
    }
  }, [onCallDetected, stopPolling, isPremium]);

  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.phase === "ended" || activeCall.phase === "failed") return;

    pollRef.current = setInterval(() => pollStatus(activeCall.callControlId), 1500);
    pollStatus(activeCall.callControlId);

    return stopPolling;
  }, [activeCall?.callControlId, activeCall?.phase, pollStatus, stopPolling]);

  async function startTestCall() {
    if (!canTest) return;
    setStarting(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const url = isPremium
        ? "/api/voice/agents/elevenlabs/outbound-call"
        : "/api/telephony/test-call";
      const body = isPremium
        ? { voice_agent_id: agentId, test_number_id: selectedTest!.id }
        : {
            voice_agent_id: agentId,
            phone_number_id: selectedLine!.id,
            test_number_id: selectedTest!.id
          };
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar la llamada");
        if (data.code === "premium_phone_not_configured" && data.available_numbers?.length) {
          setError(
            `${data.error} IDs disponibles: ${data.available_numbers.map((n: { phone_number_id: string; phone_number: string }) => `${n.phone_number} (${n.phone_number_id})`).join(", ")}`
          );
        }
        return;
      }
      setActiveCall({
        callId: data.call_id,
        callControlId: data.call_control_id,
        from: data.from,
        to: data.to,
        agentName: data.agent_name ?? agentName,
        phase: "dialing",
        statusLabel: "Marcando",
        durationSec: 0
      });
    } catch {
      setError("Error de red al marcar");
    } finally {
      setStarting(false);
    }
  }

  function resetCall() {
    stopPolling();
    setActiveCall(null);
    setError("");
  }

  async function copySender() {
    const e164 = isPremium ? premiumLine?.e164 : selectedLine?.e164;
    if (!e164) return;
    await navigator.clipboard.writeText(e164);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className={registryTableLoading}>
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

  if (activeCall) {
    const isLive = !["ended", "failed"].includes(activeCall.phase);
    const showTimer = CONNECTED_PHASES.includes(activeCall.phase) && activeCall.durationSec > 0;

    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto">
          {isLive ? (
            <p className={`text-xs ${textMuted} mb-4`}>
              Llamada entre números — cuelga desde tu celular cuando termines.
            </p>
          ) : (
            <button onClick={resetCall} className={`${btnGhost} mb-4`}>
              <ArrowLeft className="w-3.5 h-3.5" /> Nueva llamada de prueba
            </button>
          )}

          <div className="rounded-2xl border border-white/[.10] bg-noova-surface p-6">
            <div className="flex flex-col items-center text-center pb-6 border-b border-white/[.06]">
              <div className="relative mb-5">
                {isLive && (
                  <>
                    <div className="absolute -inset-3 rounded-full bg-[#5b5bf6]/20 blur-lg" />
                    <div className="absolute inset-0 rounded-full border border-[#5b5bf6]/30 animate-pulse" />
                  </>
                )}
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-[#5b5bf6] to-[#7070f8] flex items-center justify-center shadow-lg">
                  <Phone className="w-8 h-8 text-white" />
                </div>
              </div>

              <p className="text-base font-semibold text-white">{activeCall.agentName}</p>
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[.04] border border-white/[.08]">
                <span className={`w-2 h-2 rounded-full ${phaseColor(activeCall.phase)}`} />
                <span className="text-xs text-gray-300">{activeCall.statusLabel || PHASE_LABEL[activeCall.phase]}</span>
              </div>

              {showTimer && activeCall.durationSec > 0 && (
                <p className="text-2xl font-semibold text-white tabular-nums mt-4">
                  {formatDuration(activeCall.durationSec)}
                </p>
              )}

              <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                <span className="font-mono text-gray-300">{formatPhoneDisplay(activeCall.from)}</span>
                {" → "}
                <span className="font-mono text-gray-300">{formatPhoneDisplay(activeCall.to)}</span>
              </p>

              {activeCall.phase === "dialing" && (
                <p className="text-[11px] text-gray-500 mt-2">
                  {isPremium ? "Marcando desde la línea premium..." : "Conectando con Telnyx..."}
                </p>
              )}
              {activeCall.phase === "ringing" && (
                <p className="text-[11px] text-gray-500 mt-2">Tu celular debería estar sonando</p>
              )}
              {(activeCall.phase === "speaking" || activeCall.phase === "connected") && (
                <p className="text-[11px] text-gray-500 mt-2">Conversación activa — revisa el registro al finalizar</p>
              )}
            </div>

            {activeCall.error && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/[.06] border border-red-500/20 text-xs text-red-400 leading-relaxed">
                {activeCall.error}
              </div>
            )}

            {activeCall.phase === "ended" && !activeCall.error && (
              <p className="mt-4 text-xs text-emerald-400 text-center">
                Llamada finalizada{activeCall.durationSec > 0 ? ` · ${formatDuration(activeCall.durationSec)}` : ""}.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8">
      <RegistryTableLayout
        search={isPremium ? "" : lineSearch}
        onSearchChange={isPremium ? () => {} : setLineSearch}
        searchPlaceholder="Buscar remitente"
        onRefresh={load}
        action={
          (isPremium ? premiumLine?.e164 : selectedLine) ? (
            <button onClick={copySender} className={btnPrimarySm}>
              {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado" : "Copiar remitente"}
            </button>
          ) : undefined
        }
        alerts={
          isPremium ? (
            !premiumLineReady ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/[.06] p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-100">Línea premium no configurada</p>
                    <p className={`text-xs ${textMuted} mt-1`}>
                      Importa tu número en ElevenLabs → Phone Numbers (SIP/Telnyx) y define{" "}
                      <code className="text-white">ELEVENLABS_PHONE_NUMBER_ID</code> en el servidor.
                    </p>
                    {(premiumLine?.available_numbers?.length ?? 0) > 0 && (
                      <p className={`text-xs ${textMuted} mt-2`}>
                        Números en ElevenLabs:{" "}
                        {premiumLine!.available_numbers!.map(n => `${n.phone_number} (${n.phone_number_id})`).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : undefined
          ) : agentLines.length === 0 ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[.06] p-4 mb-4">
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
          ) : undefined
        }
      >
        <p className="text-sm font-semibold text-white mb-3">Número remitente</p>
        <p className={`text-xs ${textMuted} -mt-2 mb-3`}>
          {isPremium
            ? "Línea premium importada en ElevenLabs (SIP)"
            : "Línea Noova / Telnyx asignada al agente en Canales"}
        </p>
        {isPremium ? (
          premiumLineReady ? (
            <div className={registryTableWrap}>
              <table className={registryTable}>
                <thead className={registryTableHead}>
                  <tr className={registryTableHeadRow}>
                    <th className={registryTableHeadCell}>Nombre</th>
                    <th className={registryTableHeadCell}>Número</th>
                    <th className={registryTableHeadCell}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={registryTableRowClickable}>
                    <td className={`${registryTableCell} text-gray-200`}>
                      {premiumLine?.label ?? "Línea premium"}
                    </td>
                    <td className={`${registryTableCell} font-mono text-sm text-white`}>
                      {premiumLine?.e164 ? formatPhoneDisplay(premiumLine.e164) : "Configurada en servidor"}
                    </td>
                    <td className={registryTableCell}>
                      <span className="inline-flex items-center gap-1.5 text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" /> Activo
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null
        ) : agentLines.length > 0 ? (
          <div className={registryTableWrap}>
            <table className={registryTable}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={`${registryTableHeadCell} w-8`} />
                  <th className={registryTableHeadCell}>Número</th>
                  <th className={registryTableHeadCell}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map(line => {
                  const selected = line.id === selectedLineId;
                  return (
                    <tr
                      key={line.id}
                      onClick={() => setSelectedLineId(line.id)}
                      className={`${registryTableRowClickable} ${selected ? "bg-[#5b5bf6]/[.06]" : ""}`}
                    >
                      <td className={registryTableCellFirst}>
                        <span className={`block w-3.5 h-3.5 rounded-full border-2 ${
                          selected ? "border-[#5b5bf6] bg-[#5b5bf6]" : "border-gray-500"
                        }`} />
                      </td>
                      <td className={`${registryTableCell} font-mono text-sm text-white`}>
                        {formatPhoneDisplay(line.e164)}
                        {selected && <span className="ml-2 text-[10px] text-gray-400 font-sans">Actual</span>}
                      </td>
                      <td className={registryTableCell}>
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
        ) : null}
      </RegistryTableLayout>

      <RegistryTableLayout
        search={testSearch}
        onSearchChange={setTestSearch}
        searchPlaceholder="Buscar destinatario"
        onRefresh={load}
        action={
          <Link href="/dashboard/agentes-voz/numeros-prueba" className={btnPrimarySm}>
            Gestionar números
          </Link>
        }
      >
        <p className="text-sm font-semibold text-white mb-3">Número destinatario</p>
        <p className={`text-xs ${textMuted} -mt-2 mb-3`}>Celular de prueba que recibirá la llamada</p>
        {testNumbers.length > 0 ? (
          <div className={registryTableWrap}>
            <table className={registryTable}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={`${registryTableHeadCell} w-8`} />
                  <th className={registryTableHeadCell}>Nombre</th>
                  <th className={registryTableHeadCell}>Número</th>
                  <th className={registryTableHeadCell}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredTests.map(test => {
                  const selected = test.id === selectedTestId;
                  return (
                    <tr
                      key={test.id}
                      onClick={() => setSelectedTestId(test.id)}
                      className={`${registryTableRowClickable} ${selected ? "bg-[#5b5bf6]/[.06]" : ""}`}
                    >
                      <td className={registryTableCellFirst}>
                        <span className={`block w-3.5 h-3.5 rounded-full border-2 ${
                          selected ? "border-[#5b5bf6] bg-[#5b5bf6]" : "border-gray-500"
                        }`} />
                      </td>
                      <td className={`${registryTableCell} text-gray-200`}>{test.label}</td>
                      <td className={`${registryTableCell} font-mono text-sm text-white`}>
                        {formatPhoneDisplay(test.e164)}
                        {selected && <span className="ml-2 text-[10px] text-gray-400 font-sans">Actual</span>}
                      </td>
                      <td className={registryTableCell}>
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
        ) : (
          <div className="py-12 text-center space-y-3">
            <p className={`text-sm ${textSecondary}`}>Sin números destinatarios activos</p>
            <Link href="/dashboard/agentes-voz/numeros-prueba" className={btnPrimary}>
              Nuevo número de prueba
            </Link>
          </div>
        )}
      </RegistryTableLayout>

      {canTest && (
        <div className="border-t border-white/[.08] pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Radio className="w-4 h-4 text-[#5b5bf6]" />
                <p className="text-sm font-medium text-white">Listo para probar</p>
              </div>
              <p className={`text-xs ${textSecondary}`}>
                {isPremium ? (
                  <>
                    Desde{" "}
                    <span className="font-mono text-white">
                      {premiumLine?.e164 ? formatPhoneDisplay(premiumLine.e164) : "línea premium"}
                    </span>
                    {" "}hacia{" "}
                    <span className="font-mono text-white">{formatPhoneDisplay(selectedTest!.e164)}</span>.
                  </>
                ) : (
                  <>
                    Desde <span className="font-mono text-white">{formatPhoneDisplay(selectedLine!.e164)}</span> hacia{" "}
                    <span className="font-mono text-white">{formatPhoneDisplay(selectedTest!.e164)}</span>.
                  </>
                )}
                {" "}Contesta en tu celular para escuchar al agente.
              </p>
            </div>
            <button onClick={startTestCall} disabled={starting} className={`${btnPrimary} shrink-0`}>
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
              {starting ? "Marcando..." : "Iniciar llamada de prueba"}
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-3 leading-relaxed">{error}</p>}
        </div>
      )}
    </div>
  );
}
