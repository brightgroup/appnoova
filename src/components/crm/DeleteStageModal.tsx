"use client";

import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

interface DeleteStageModalProps {
  stage: { id: string; name: string } | null;
  otherStages: { id: string; name: string }[];
  leadCount: number | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (reassignToStageId?: string) => void;
}

/** Confirmación de borrado de etapa; si tiene leads asignados, exige elegir a dónde moverlos primero (patrón HubSpot). */
export function DeleteStageModal({
  stage,
  otherStages,
  leadCount,
  saving = false,
  error,
  onClose,
  onConfirm
}: DeleteStageModalProps) {
  const [targetStageId, setTargetStageId] = useState("");

  useEffect(() => {
    if (stage) setTargetStageId(otherStages[0]?.id ?? "");
  }, [stage, otherStages]);

  if (!stage) return null;

  const needsReassign = (leadCount ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#13141c] border border-white/[.10] rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <h3 className="text-lg font-semibold text-white mb-1">Eliminar etapa</h3>

        {needsReassign ? (
          <>
            <p className="text-sm text-gray-400 leading-relaxed flex items-start gap-2">
              <TriangleAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-white">{stage.name}</strong> tiene {leadCount}{" "}
                {leadCount === 1 ? "lead asignado" : "leads asignados"}. Elige a qué etapa moverlos antes de
                eliminarla, para no romper el embudo de ventas.
              </span>
            </p>
            <div className="mt-4">
              <label className="block text-xs text-gray-500 mb-1.5">Mover leads a</label>
              <NoovaSelect
                value={targetStageId}
                onChange={setTargetStageId}
                options={otherStages.map(s => ({ value: s.id, label: s.name }))}
                allowEmpty={false}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 leading-relaxed">
            Se eliminará <strong className="text-white">{stage.name}</strong>. Esta acción no se puede deshacer.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-4">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/[.06] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(needsReassign ? targetStageId : undefined)}
            disabled={saving || (needsReassign && !targetStageId)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 flex items-center gap-2 bg-red-600 hover:bg-red-500"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Eliminando…" : needsReassign ? "Mover y eliminar" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
