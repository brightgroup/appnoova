"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, GripVertical, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  btnGhost, btnPrimary, btnFilterGroup, btnFilterActive, btnFilterIdle,
  registryPage, registryToolbar, registryContent, registryPanel, textMuted
} from "@/lib/brand-ui";
import { DEFAULT_CRM_STAGES } from "@/lib/crm-record";
import { DEFAULT_STAGE_AI_CRITERIA } from "@/lib/crm-lead-ai-shared";
import { CrmPropertyConfigPanel } from "@/components/crm/CrmPropertyConfigPanel";
import { CrmTenantLabelsPanel } from "@/components/crm/CrmTenantLabelsPanel";
import { CreateStageModal } from "@/components/crm/CreateStageModal";
import { DeleteStageModal } from "@/components/crm/DeleteStageModal";
import type { CrmPipelineStage } from "@/types/crm";

type Tab = "stages" | "contacts" | "leads" | "labels";
type StageDraft = Omit<CrmPipelineStage, "user_id" | "created_at" | "updated_at"> & { id?: string };

export default function CrmConfigPage() {
  const [tab, setTab] = useState<Tab>("stages");
  const [stages, setStages] = useState<StageDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteLeadCount, setDeleteLeadCount] = useState<number | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/crm/stages", { headers });
    const data = await res.json();
    if (res.ok && data.stages?.length) {
      setStages(data.stages.filter((s: CrmPipelineStage) => !s.is_won && !s.is_lost));
    } else {
      setStages(DEFAULT_CRM_STAGES.map((s, i) => ({ ...s, id: `new-${i}` })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStage = (index: number, patch: Partial<StageDraft>) => {
    setStages(prev => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const handleCreateStage = async (payload: { name: string; color: string; ai_enter_criteria: string | null }) => {
    setCreateSaving(true);
    setCreateError(null);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/crm/stages", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      setStages((data.stages ?? []).filter((s: CrmPipelineStage) => !s.is_won && !s.is_lost));
      setCreateOpen(false);
    } else {
      setCreateError(data?.error ?? "No se pudo crear la etapa.");
    }
    setCreateSaving(false);
  };

  const handleDeleteClick = (stage: StageDraft) => {
    if (stages.length <= 2) return;
    if (!stage.id || stage.id.startsWith("new-")) {
      setStages(prev => prev.filter(s => s !== stage).map((s, i) => ({ ...s, sort_order: i })));
      return;
    }
    setDeleteTarget({ id: stage.id, name: stage.name });
    setDeleteLeadCount(null);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async (reassignToStageId?: string) => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    setDeleteError(null);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/stages/${deleteTarget.id}`, {
      method: "DELETE",
      headers,
      body: JSON.stringify(reassignToStageId ? { reassign_to_stage_id: reassignToStageId } : {})
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      setStages((data.stages ?? []).filter((s: CrmPipelineStage) => !s.is_won && !s.is_lost));
      setDeleteTarget(null);
      setDeleteLeadCount(null);
    } else if (res.status === 409 && data?.lead_count != null) {
      setDeleteLeadCount(data.lead_count);
    } else {
      setDeleteError(data?.error ?? "No se pudo eliminar. Intenta de nuevo.");
    }
    setDeleteSaving(false);
  };

  const saveStages = async () => {
    setSaving(true);
    setSaveError(null);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/crm/stages", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        stages: stages.map((s, i) => ({
          id: s.id && !s.id.startsWith("new-") ? s.id : undefined,
          name: s.name,
          slug: s.slug,
          color: s.color,
          sort_order: i,
          ai_enter_criteria: s.ai_enter_criteria ?? null
        }))
      })
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      setStages((data.stages ?? []).filter((s: CrmPipelineStage) => !s.is_won && !s.is_lost));
    } else {
      setSaveError(data?.error ?? "No se pudo guardar. Intenta de nuevo.");
    }
    setSaving(false);
  };

  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/crm/leads" className="p-1.5 hover:bg-white/[.06] rounded-lg text-gray-400">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Configuración CRM</h1>
              <p className={`text-xs ${textMuted} mt-0.5`}>
                Etapas del pipeline y propiedades de contactos y leads
              </p>
            </div>
          </div>
          {tab === "stages" && (
            <div className="flex gap-2">
              <button type="button" onClick={() => { setCreateError(null); setCreateOpen(true); }} className={btnGhost}>
                <Plus className="w-4 h-4" /> Etapa
              </button>
              <button type="button" onClick={saveStages} disabled={saving} className={btnPrimary}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Guardar</>}
              </button>
            </div>
          )}
        </div>
        <div className={`${btnFilterGroup} mt-4`}>
          <button type="button" onClick={() => setTab("stages")} className={tab === "stages" ? btnFilterActive : btnFilterIdle}>
            Etapas
          </button>
          <button type="button" onClick={() => setTab("contacts")} className={tab === "contacts" ? btnFilterActive : btnFilterIdle}>
            Contactos
          </button>
          <button type="button" onClick={() => setTab("leads")} className={tab === "leads" ? btnFilterActive : btnFilterIdle}>
            Leads
          </button>
          <button type="button" onClick={() => setTab("labels")} className={tab === "labels" ? btnFilterActive : btnFilterIdle}>
            Labels
          </button>
        </div>
      </div>

      <div className={registryContent}>
        <div className={`${registryPanel} max-w-2xl`}>
          {tab === "stages" && (
            loading ? (
              <div className="flex justify-center py-16 text-gray-400 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando etapas…
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-500 mb-4">
                  Las etapas representan el avance en el pipeline. Define cuándo la IA debe mover un lead a cada etapa según la conversación.
                </p>
                {saveError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
                    {saveError}
                  </p>
                )}
                {stages.map((stage, i) => (
                  <div key={stage.id ?? i} className="border-b border-white/[.06] py-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-gray-600 shrink-0" />
                      <input
                        type="color"
                        value={stage.color}
                        onChange={e => updateStage(i, { color: e.target.value })}
                        className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer shrink-0"
                      />
                      <input
                        value={stage.name}
                        onChange={e => updateStage(i, {
                          name: e.target.value,
                          slug: e.target.value.toLowerCase().replace(/\s+/g, "_")
                        })}
                        className="flex-1 rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(stage)}
                        disabled={stages.length <= 2}
                        className={btnGhost}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="pl-11">
                      <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
                        Criterio IA — mover aquí cuando…
                      </label>
                      <textarea
                        value={
                          stage.ai_enter_criteria ??
                          DEFAULT_STAGE_AI_CRITERIA[stage.slug] ??
                          ""
                        }
                        onChange={e =>
                          updateStage(i, { ai_enter_criteria: e.target.value || null })
                        }
                        rows={2}
                        placeholder="Ej. El cliente pidió cotización o precio…"
                        className="w-full rounded-lg border border-white/[.10] bg-white/[.04] px-3 py-2 text-xs text-gray-300 resize-y"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
          {tab === "contacts" && <CrmPropertyConfigPanel entityType="contact" />}
          {tab === "leads" && <CrmPropertyConfigPanel entityType="lead" />}
          {tab === "labels" && <CrmTenantLabelsPanel />}
        </div>
      </div>

      <CreateStageModal
        open={createOpen}
        saving={createSaving}
        error={createError}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateStage}
      />
      <DeleteStageModal
        stage={deleteTarget}
        otherStages={stages
          .filter((s): s is StageDraft & { id: string } => !!s.id && s.id !== deleteTarget?.id)
          .map(s => ({ id: s.id, name: s.name }))}
        leadCount={deleteLeadCount}
        saving={deleteSaving}
        error={deleteError}
        onClose={() => { setDeleteTarget(null); setDeleteLeadCount(null); setDeleteError(null); }}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
