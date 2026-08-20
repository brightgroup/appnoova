"use client";

import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { btnGhost, btnPrimary } from "@/lib/brand-ui";

interface CreateStageModalProps {
  open: boolean;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: (data: { name: string; color: string; ai_enter_criteria: string | null }) => void;
}

export function CreateStageModal({ open, saving, error, onClose, onCreate }: CreateStageModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0f7eff");
  const [aiCriteria, setAiCriteria] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setColor("#0f7eff");
      setAiCriteria("");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#13141c] border border-white/[.10] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#0f7eff]" />
            <h2 className="text-lg font-semibold text-white">Nueva etapa</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nombre</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-9 h-9 rounded-lg border-0 bg-transparent cursor-pointer shrink-0"
              />
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej. Propuesta enviada"
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Criterio IA — mover aquí cuando…</label>
            <textarea
              value={aiCriteria}
              onChange={e => setAiCriteria(e.target.value)}
              rows={2}
              placeholder="Ej. El cliente pidió cotización o precio…"
              className="w-full rounded-xl border border-white/[.12] bg-[#0d0e14] px-4 py-2.5 text-sm text-gray-300 resize-y"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[.08]">
          <button type="button" onClick={onClose} disabled={saving} className={btnGhost}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!name.trim() || saving}
            onClick={() => onCreate({ name: name.trim(), color, ai_enter_criteria: aiCriteria.trim() || null })}
            className={btnPrimary}
          >
            {saving ? "Creando…" : "Crear etapa"}
          </button>
        </div>
      </div>
    </div>
  );
}
