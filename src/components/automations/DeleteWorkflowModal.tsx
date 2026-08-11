"use client";

import { Loader2 } from "lucide-react";

interface DeleteWorkflowModalProps {
  workflowName: string | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Confirmación de borrado, mismo patrón visual que WhatsAppChannelConfirmModal. */
export function DeleteWorkflowModal({ workflowName, loading = false, onClose, onConfirm }: DeleteWorkflowModalProps) {
  if (!workflowName) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#13141c] border border-white/[.10] rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <h3 className="text-lg font-semibold text-white mb-1">Eliminar workflow</h3>
        <p className="text-sm text-gray-400 leading-relaxed">
          Se eliminará <strong className="text-white">{workflowName}</strong> y dejará de disparar eventos de
          inmediato. Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/[.06] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 flex items-center gap-2 bg-red-600 hover:bg-red-500"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
