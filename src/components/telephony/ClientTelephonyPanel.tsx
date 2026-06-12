"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, ChevronLeft, Link2, Clock } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import {
  btnPrimary, btnGhost, registryPage, registryToolbar, registryContent, textMuted
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { PhoneLinesTable, type PhoneLineRow } from "@/components/telephony/PhoneLinesTable";
import {
  PhoneNumberCategoryTabs,
  type PhoneNumberCategoryTab
} from "@/components/telephony/PhoneNumberCategoryTabs";
import { isPurchasedNumber, isVerifiedNumber } from "@/lib/telephony/number-type-labels";
import { ClientLineWizard } from "@/components/telephony/ClientLineWizard";
import type { PhoneNumberRecord } from "@/types/phone-number";

export function ClientTelephonyPanel({
  backHref = "/dashboard/agentes-voz",
  title = "Números telefónicos",
  subtitle = "Verificados (outbound) y comprados (inbound + outbound)"
}: {
  backHref?: string;
  title?: string;
  subtitle?: string;
} = {}) {
  const [lines, setLines] = useState<PhoneNumberRecord[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<PhoneNumberCategoryTab>("purchased");
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

  const verifiedLines = useMemo(
    () => lines.filter(l => isVerifiedNumber(l.number_type)),
    [lines]
  );
  const purchasedLines = useMemo(
    () => lines.filter(l => isPurchasedNumber(l.number_type)),
    [lines]
  );

  const tabLines = tab === "verified" ? verifiedLines : purchasedLines;

  const filtered = tabLines.filter(l => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      l.e164.includes(q) ||
      (l.friendly_name ?? "").toLowerCase().includes(q)
    );
  });

  const tableRows: PhoneLineRow[] = filtered.map(l => ({
    id: l.id,
    e164: l.e164,
    friendly_name: l.friendly_name,
    country_code: l.country_code,
    number_type: l.number_type,
    status: l.status,
    provider: l.provider
  }));

  const emptyMessage = tab === "verified"
    ? "No tienes números verificados. Usa «Vincular línea» para solicitar verificación outbound."
    : "No tienes líneas compradas. Usa «Solicitar línea» para pedir una a Noova.";

  const description = tab === "verified"
    ? "Números verificados de tu negocio para llamadas salientes (outbound). Las llamadas entrantes no pasan por el agente IA."
    : "Líneas compradas y asignadas por Noova con capacidad inbound y outbound.";

  return (
    <>
      <div className={registryPage}>
        <div className={registryToolbar}>
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={backHref}
              className="p-1.5 hover:bg-white/[.06] rounded-lg text-gray-400 hover:text-white shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              <p className={`text-xs ${textMuted} mt-0.5`}>{subtitle}</p>
            </div>
          </div>
        </div>

        <div className={registryContent}>
          <RegistryTableLayout
            description={description}
            search={search}
            onSearchChange={setSearch}
            onRefresh={load}
            refreshing={loading}
            filters={
              <PhoneNumberCategoryTabs
                value={tab}
                onChange={setTab}
                verifiedCount={verifiedLines.length}
                purchasedCount={purchasedLines.length}
              />
            }
            alerts={pendingCount > 0 ? (
              <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[.06] text-xs text-amber-200">
                <Clock className="w-4 h-4 shrink-0" />
                {pendingCount} solicitud{pendingCount > 1 ? "es" : ""} en revisión por Noova
              </div>
            ) : undefined}
            action={
              <>
                <button onClick={() => setShowWizard(true)} className={btnGhost}>
                  <Link2 className="w-4 h-4" /> Vincular línea
                </button>
                <button onClick={() => setShowWizard(true)} className={btnPrimary}>
                  <Plus className="w-4 h-4" /> Solicitar línea
                </button>
              </>
            }
          >
            <PhoneLinesTable
              rows={tableRows}
              mode="client"
              loading={loading}
              emptyMessage={emptyMessage}
            />
          </RegistryTableLayout>
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
