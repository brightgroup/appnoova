"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { btnPrimary, inputSearch, textMuted } from "@/lib/brand-ui";
import type { TestPhoneNumberRecord } from "@/types/test-phone-number";

interface TestPhoneNumberModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { label: string; e164: string }) => Promise<void>;
  initial?: TestPhoneNumberRecord | null;
  saving?: boolean;
}

export function TestPhoneNumberModal({
  open,
  onClose,
  onSave,
  initial,
  saving
}: TestPhoneNumberModalProps) {
  const [label, setLabel] = useState("");
  const [e164, setE164] = useState("");

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? "");
      setE164(initial?.e164 ?? "");
    }
  }, [open, initial]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave({ label: label.trim() || "Sin nombre", e164: e164.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-white/[.12] bg-noova-surface shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[.08]">
          <h3 className="text-sm font-semibold text-white">
            {initial ? "Editar número de prueba" : "Nuevo número de prueba"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.08]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className={`block text-[11px] font-medium ${textMuted} mb-1.5 uppercase tracking-wide`}>Nombre</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Mi celular"
              className={inputSearch.replace("pl-10", "px-3")}
              required
            />
          </div>
          <div>
            <label className={`block text-[11px] font-medium ${textMuted} mb-1.5 uppercase tracking-wide`}>Número E.164</label>
            <input
              value={e164}
              onChange={e => setE164(e.target.value)}
              placeholder="+573001234567"
              className={inputSearch.replace("pl-10", "px-3")}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {initial ? "Guardar cambios" : "Crear número"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
