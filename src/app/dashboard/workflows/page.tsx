"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Workflow as WorkflowIcon, Plus, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { Badge } from "@/components/ui/Badge";
import {
  btnPrimary,
  registryTable,
  registryTableHead,
  registryTableHeadRow,
  registryTableHeadCell,
  registryTableRowClickable,
  registryTableCell,
  registryTableCellFirst,
  registryTableEmpty
} from "@/lib/brand-ui";
import type { WorkflowRecord } from "@/lib/automations/workflows-db";
import { NODE_CATALOG } from "@/lib/automations/node-types";

function summarizeGraph(workflow: WorkflowRecord): string {
  const labelFor = (typeId: string) => NODE_CATALOG.find(n => n.type === typeId)?.label ?? typeId;
  const steps = workflow.graph.nodes.map(n => labelFor(n.type));
  if (steps.length === 0) return "Vacío — sin pasos todavía";
  return steps.join(" → ");
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authFetch("/api/automations/workflows");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar workflows");
    else setWorkflows(json.workflows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createWorkflow() {
    setCreating(true);
    const res = await authFetch("/api/automations/workflows", {
      method: "POST",
      body: JSON.stringify({ name: "Nuevo workflow" })
    });
    const json = await res.json();
    setCreating(false);
    if (res.ok) router.push(`/dashboard/workflows/${json.workflow.id}`);
    else setError(json.error ?? "No se pudo crear el workflow");
  }

  async function toggleStatus(w: WorkflowRecord) {
    setTogglingId(w.id);
    const nextStatus = w.status === "active" ? "paused" : "active";
    const res = await authFetch(`/api/automations/workflows/${w.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus })
    });
    setTogglingId(null);
    if (res.ok) {
      setWorkflows(prev => prev.map(item => (item.id === w.id ? { ...item, status: nextStatus } : item)));
    }
  }

  return (
    <ChannelListPage
      title="Workflows"
      description="Arma qué pasa en Noova cuando ocurre algo en una conversación, con los conectores que ya tienes."
      loading={loading}
      onRefresh={load}
      refreshing={loading}
      error={error || undefined}
      action={
        <button type="button" onClick={() => void createWorkflow()} disabled={creating} className={`${btnPrimary} gap-2`}>
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Nuevo workflow
        </button>
      }
    >
      {workflows.length === 0 ? (
        <div className={`${registryTableEmpty} flex flex-col items-center gap-3 py-16`}>
          <WorkflowIcon className="w-10 h-10 text-gray-600" />
          <p className="text-gray-400">Aún no tienes workflows.</p>
          <button type="button" onClick={() => void createWorkflow()} disabled={creating} className={`${btnPrimary} gap-2`}>
            <Plus className="w-4 h-4" /> Crear tu primer workflow
          </button>
        </div>
      ) : (
        <table className={`${registryTable} min-w-[640px]`}>
          <thead className={registryTableHead}>
            <tr className={registryTableHeadRow}>
              <th className={registryTableHeadCell}>Workflow</th>
              <th className={registryTableHeadCell}>Disparador → Acción</th>
              <th className={registryTableHeadCell}>Estado</th>
              <th className={registryTableHeadCell}>Editado</th>
              <th className={`${registryTableHeadCell} w-12`} />
            </tr>
          </thead>
          <tbody>
            {workflows.map(w => (
              <tr key={w.id} className={registryTableRowClickable} onClick={() => router.push(`/dashboard/workflows/${w.id}`)}>
                <td className={registryTableCellFirst}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#0f7eff]/15 flex items-center justify-center shrink-0">
                      <WorkflowIcon className="w-[18px] h-[18px] text-[#0f7eff]" />
                    </div>
                    <div className="text-sm font-medium text-white truncate">{w.name}</div>
                  </div>
                </td>
                <td className={`${registryTableCell} text-sm text-gray-400 truncate max-w-xs`}>{summarizeGraph(w)}</td>
                <td className={registryTableCell}>
                  {w.status === "active" ? <Badge variant="emerald">Activo</Badge> : <Badge variant="neutral">Pausado</Badge>}
                </td>
                <td className={`${registryTableCell} text-xs text-gray-500 whitespace-nowrap`}>
                  {new Date(w.updatedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                </td>
                <td className={registryTableCell} onClick={e => e.stopPropagation()}>
                  <StatusToggle
                    active={w.status === "active"}
                    disabled={togglingId === w.id}
                    onToggle={() => void toggleStatus(w)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChannelListPage>
  );
}

function StatusToggle({ active, disabled, onToggle }: { active: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={active ? "Pausar workflow" : "Activar workflow"}
      className={`relative w-8 h-[18px] rounded-full transition-colors disabled:opacity-50 ${active ? "bg-[#0f7eff]" : "bg-white/[.14]"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${active ? "translate-x-[14px]" : ""}`}
      />
    </button>
  );
}
