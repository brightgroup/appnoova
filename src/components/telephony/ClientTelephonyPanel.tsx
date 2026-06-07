"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Plus, Search, RefreshCw, ChevronLeft, Link2, Clock } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import {
  btnPrimary, btnGhost, btnIcon, inputSearch, registryPage, registryToolbar, textMuted
} from "@/lib/brand-ui";
import { PhoneLinesTable, type PhoneLineRow } from "@/components/telephony/PhoneLinesTable";
import { ClientLineWizard } from "@/components/telephony/ClientLineWizard";
import type { PhoneNumberRecord } from "@/types/phone-number";

export function ClientTelephonyPanel() {
  const [lines, setLines] = useState<PhoneNumberRecord[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showWizard, setShowWizard] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [linesRes, reqRes] = await Promise.all([
        fetch("/api/telephony/numbers", { headers }),
        fetch("/api/telephony/requests", { headers })
      ]);
      const linesData = await linesRes.json();
      const reqData = await reqRes.json();
      if (linesRes.ok) setLines(linesData.phone_numbers ?? []);
      if (reqRes.ok) {
        setPendingCount((reqData.requests ?? []).filter((r: { status: string }) => r.status === "pending").length);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = lines.filter(l => l.e164.includes(search));

  const tableRows: PhoneLineRow[] = filtered.map(l => ({
    id: l.id,
    e164: l.e164,
    country_code: l.country_code,
    status: l.status,
    provider: l.provider
  }));

  return (
    <>
      <div className={registryPage}>
        <div className={registryToolbar}>
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href="/dashboard/agentes-voz"
                className="p-1.5 hover:bg-white/[.06] rounded-lg text-gray-400 hover:text-white shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Números telefónicos</h1>
                <p className={`text-xs ${textMuted} mt-0.5`}>Tus líneas y solicitudes a Noova</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setShowWizard(true)} className={btnGhost}>
                <Link2 className="w-4 h-4" /> Vincular línea
              </button>
              <button onClick={() => setShowWizard(true)} className={btnPrimary}>
                <Plus className="w-4 h-4" /> Solicitar línea
              </button>
            </div>
          </div>

          {pendingCount > 0 && (
            <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[.06] text-xs text-amber-200">
              <Clock className="w-4 h-4 shrink-0" />
              {pendingCount} solicitud{pendingCount > 1 ? "es" : ""} en revisión por Noova
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar número..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`${inputSearch} placeholder-gray-600`}
              />
            </div>
            <button onClick={load} className={btnIcon} title="Actualizar">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <PhoneLinesTable
            rows={tableRows}
            mode="client"
            loading={loading}
            emptyMessage="No tienes líneas asignadas. Usa «Solicitar línea» para pedir una a Noova."
          />
        </div>
      </div>

      <ClientLineWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={load}
      />
    </>
  );
}
