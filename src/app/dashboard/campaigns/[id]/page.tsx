"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Pause, Play } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { registryPage, btnGhost, btnPrimary } from "@/lib/brand-ui";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/record";
import type { VoiceCampaignRecord } from "@/types/voice-campaign";

export default function CampanaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<VoiceCampaignRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authFetch(`/api/campaigns/${id}`);
    const json = await res.json();
    setLoading(false);
    if (res.ok) setCampaign(json.campaign);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const toggleStatus = async () => {
    if (!campaign) return;
    const next = campaign.status === "active" ? "paused" : "active";
    const res = await authFetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const json = await res.json();
    if (res.ok) setCampaign(json.campaign);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Campaña no encontrada
      </div>
    );
  }

  return (
    <div className={registryPage}>
      <div className="px-6 py-4 border-b border-white/[.08] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/campaigns" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.06]">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white truncate">{campaign.name}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {CAMPAIGN_STATUS_LABELS[campaign.status]} · Motor de llamadas próximamente
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/dashboard/campaigns/${id}/editar`} className={btnGhost}>
            Editar configuración
          </Link>
          {(campaign.status === "active" || campaign.status === "paused") && (
            <button
              type="button"
              onClick={() => void toggleStatus()}
              className={`${btnPrimary} gap-2`}
            >
              {campaign.status === "active" ? (
                <><Pause className="w-4 h-4" /> Pausar</>
              ) : (
                <><Play className="w-4 h-4" /> Reanudar</>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="p-6 max-w-3xl space-y-6">
        {campaign.goal && (
          <section className="rounded-xl border border-white/[.08] p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-2">Objetivo</h2>
            <p className="text-sm text-gray-400 leading-relaxed">{campaign.goal}</p>
          </section>
        )}

        <section className="rounded-xl border border-amber-500/20 bg-amber-500/[.06] p-5">
          <p className="text-sm text-amber-200/90">
            La campaña está configurada. El motor automático de llamadas (cron cada 20 min) se activará en la siguiente fase de implementación.
          </p>
        </section>
      </div>
    </div>
  );
}
