"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Target, MoreHorizontal, Trash2, Rocket, Pause, Play, RotateCcw } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { CampaignWizardModal } from "@/components/campaigns/CampaignWizardModal";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import {
  btnPrimary,
  registryTable,
  registryTableHead,
  registryTableHeadRow,
  registryTableHeadCell,
  registryTableRowClickable,
  registryTableCell,
  registryTableCellFirst,
  registryTableEmpty,
} from "@/lib/brand-ui";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns/record";
import { ClientDate } from "@/components/ui/ClientDate";
import type { VoiceCampaignRecord } from "@/types/voice-campaign";

interface CampaignsPageContentProps {
  initialWizardId?: string | null;
}

export function CampaignsPageContent({ initialWizardId = null }: CampaignsPageContentProps) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<VoiceCampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(Boolean(initialWizardId));
  const [wizardCampaignId, setWizardCampaignId] = useState<string | null>(initialWizardId);
  const [hadWizardDeepLink] = useState(Boolean(initialWizardId));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authFetch("/api/campaigns");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar");
    else setCampaigns(json.campaigns ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (initialWizardId) {
      setWizardCampaignId(initialWizardId);
      setWizardOpen(true);
    }
  }, [initialWizardId]);

  const openWizard = (id?: string | null) => {
    setWizardCampaignId(id ?? null);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardCampaignId(null);
    if (hadWizardDeepLink) {
      router.replace("/dashboard/campaigns");
    }
  };

  const filtered = campaigns.filter(c => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.goal ?? "").toLowerCase().includes(q);
  });

  const deleteCampaign = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la campaña «${name}»?`)) return;
    setDeletingId(id);
    setOpenMenuId(null);
    const res = await authFetch(`/api/campaigns/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Error al eliminar");
      return;
    }
    setCampaigns(prev => prev.filter(c => c.id !== id));
  };

  const statusBadge = (status: VoiceCampaignRecord["status"]) => {
    const colors: Record<VoiceCampaignRecord["status"], string> = {
      draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
      active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      completed: "bg-[#5b5bf6]/15 text-[#a5a5ff] border-[#5b5bf6]/30",
    };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colors[status]}`}>
        {CAMPAIGN_STATUS_LABELS[status]}
      </span>
    );
  };

  const openCampaign = (c: VoiceCampaignRecord) => {
    if (c.status === "draft" && c.wizard_step < 3) {
      openWizard(c.id);
    } else {
      router.push(`/dashboard/campaigns/${c.id}`);
    }
  };

  const activateCampaign = async (c: VoiceCampaignRecord) => {
    setOpenMenuId(null);
    if (c.wizard_step < 3) {
      openWizard(c.id);
      return;
    }
    setError("");
    const res = await authFetch(`/api/campaigns/${c.id}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field_mapping: c.field_mapping, activate: true }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "No se pudo activar la campaña");
      return;
    }
    setCampaigns(prev => prev.map(x => (x.id === c.id ? json.campaign : x)));
  };

  const setCampaignStatus = async (c: VoiceCampaignRecord, status: "active" | "paused") => {
    setOpenMenuId(null);
    const res = await authFetch(`/api/campaigns/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (res.ok) setCampaigns(prev => prev.map(x => (x.id === c.id ? json.campaign : x)));
  };

  const startNewRound = async (c: VoiceCampaignRecord) => {
    setOpenMenuId(null);
    if (
      !window.confirm(
        "¿Iniciar una nueva ronda? Todos los contactos volverán a pendiente. El historial de llamadas se conserva."
      )
    ) {
      return;
    }
    setError("");
    const res = await authFetch(`/api/campaigns/${c.id}/reset-audience`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "No se pudo preparar la nueva ronda");
      return;
    }
    if (json.campaign) {
      setCampaigns(prev => prev.map(x => (x.id === c.id ? json.campaign : x)));
    }
  };

  return (
    <ChannelListPage
      title="Campañas de voz"
      description="Automatiza llamadas salientes con tus agentes de IA. Programa recordatorios, seguimientos y más."
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar campaña…"
      onRefresh={load}
      refreshing={loading}
      error={error || undefined}
      action={
        <button type="button" onClick={() => openWizard()} className={`${btnPrimary} gap-2`}>
          <Plus className="w-4 h-4" />
          Nueva campaña
        </button>
      }
    >
      {filtered.length === 0 ? (
        <div className={`${registryTableEmpty} flex flex-col items-center gap-3 py-16`}>
          <Target className="w-10 h-10 text-gray-600" />
          <p className="text-gray-400">
            {search.trim() ? "No hay campañas con ese nombre." : "Aún no tienes campañas de voz."}
          </p>
          {!search.trim() && (
            <button type="button" onClick={() => openWizard()} className={`${btnPrimary} gap-2`}>
              <Plus className="w-4 h-4" /> Crear primera campaña
            </button>
          )}
        </div>
      ) : (
        <table className={`${registryTable} min-w-[720px]`}>
          <thead className={registryTableHead}>
            <tr className={registryTableHeadRow}>
              <th className={registryTableHeadCell}>Campaña</th>
              <th className={registryTableHeadCell}>Estado</th>
              <th className={registryTableHeadCell}>Paso</th>
              <th className={registryTableHeadCell}>Actualizado</th>
              <th className={`${registryTableHeadCell} w-12`} />
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr
                key={c.id}
                className={registryTableRowClickable}
                onClick={() => openCampaign(c)}
              >
                <td className={registryTableCellFirst}>
                  <div className="flex items-center gap-3">
                    <Target className="w-4 h-4 text-[#a5a5ff] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{c.name}</div>
                      {c.goal && (
                        <div className="text-xs text-gray-500 truncate max-w-md">{c.goal}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className={registryTableCell}>{statusBadge(c.status)}</td>
                <td className={`${registryTableCell} text-gray-400 text-sm`}>
                  {Math.min(c.wizard_step, 3)}/3
                </td>
                <td className={`${registryTableCell} text-gray-400 text-sm`}>
                  <ClientDate iso={c.updated_at} />
                </td>
                <td className={registryTableCell} onClick={e => e.stopPropagation()}>
                  <NoovaAnchoredMenu
                    open={openMenuId === c.id}
                    onClose={() => setOpenMenuId(null)}
                    menuClassName="min-w-[140px]"
                    anchor={
                      <button
                        type="button"
                        disabled={deletingId === c.id}
                        onClick={e => {
                          e.stopPropagation();
                          setOpenMenuId(prev => (prev === c.id ? null : c.id));
                        }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.08] disabled:opacity-40"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    }
                  >
                    <NoovaListMenuItem
                      onClick={() => {
                        setOpenMenuId(null);
                        if (c.status === "draft" && c.wizard_step < 3) {
                          openWizard(c.id);
                        } else {
                          router.push(`/dashboard/campaigns/${c.id}?tab=general`);
                        }
                      }}
                    >
                      Editar
                    </NoovaListMenuItem>
                    {c.status === "draft" && (
                      <NoovaListMenuItem onClick={() => void activateCampaign(c)}>
                        <Rocket className="w-3.5 h-3.5" /> Activar
                      </NoovaListMenuItem>
                    )}
                    {c.status === "active" && (
                      <NoovaListMenuItem onClick={() => void setCampaignStatus(c, "paused")}>
                        <Pause className="w-3.5 h-3.5" /> Pausar
                      </NoovaListMenuItem>
                    )}
                    {c.status === "paused" && (
                      <NoovaListMenuItem onClick={() => void setCampaignStatus(c, "active")}>
                        <Play className="w-3.5 h-3.5" /> Reanudar
                      </NoovaListMenuItem>
                    )}
                    {(c.status === "completed" || c.status === "paused") && (
                      <NoovaListMenuItem onClick={() => void startNewRound(c)}>
                        <RotateCcw className="w-3.5 h-3.5" /> Nueva ronda
                      </NoovaListMenuItem>
                    )}
                    <NoovaListMenuItem
                      danger
                      onClick={() => void deleteCampaign(c.id, c.name)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </NoovaListMenuItem>
                  </NoovaAnchoredMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CampaignWizardModal
        open={wizardOpen}
        campaignId={wizardCampaignId}
        onClose={closeWizard}
        onComplete={id => {
          void load();
          router.push(`/dashboard/campaigns/${id}`);
        }}
      />
    </ChannelListPage>
  );
}
