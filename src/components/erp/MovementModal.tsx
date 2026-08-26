"use client";

import { useEffect, useState } from "react";
import { X, ArrowDownCircle, ArrowUpCircle, SlidersHorizontal } from "lucide-react";
import { btnGhost, btnPrimary, nvControl } from "@/lib/brand-ui";
import type { InventoryItem, InventoryMovementType } from "@/types/erp";

const fieldClass = `w-full ${nvControl} px-4 py-2.5 text-sm`;

export interface MovementFormValues {
  tipo: "entrada" | "salida" | "ajuste";
  cantidad: string; // positivo para entrada/salida
  delta: string; // con signo, solo para ajuste
  fecha: string;
  responsable: string;
  nota: string;
  numeroPedido: string;
}

interface MovementModalProps {
  open: boolean;
  item: InventoryItem | null;
  /** Si puede hacer "ajuste" (nivel manage) — entrada/salida siempre disponibles con "edit". */
  canAdjust?: boolean;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: MovementFormValues) => void;
}

const TODAY = () => new Date().toISOString().slice(0, 10);

export function MovementModal({ open, item, canAdjust, saving, error, onClose, onSubmit }: MovementModalProps) {
  const [tipo, setTipo] = useState<MovementFormValues["tipo"]>("entrada");
  const [cantidad, setCantidad] = useState("");
  const [delta, setDelta] = useState("");
  const [fecha, setFecha] = useState(TODAY());
  const [responsable, setResponsable] = useState("");
  const [nota, setNota] = useState("");
  const [numeroPedido, setNumeroPedido] = useState("");

  useEffect(() => {
    if (!open) return;
    setTipo("entrada");
    setCantidad("");
    setDelta("");
    setFecha(TODAY());
    setResponsable(item?.responsable ?? "");
    setNota("");
    setNumeroPedido("");
  }, [open, item]);

  if (!open || !item) return null;

  const valid = tipo === "ajuste" ? Number(delta) !== 0 && Number.isInteger(Number(delta)) : Number(cantidad) > 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-noova-surface border border-white/[.10] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--nv-text)]">Registrar movimiento</h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{item.codigo} · {item.nombre}</p>
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

          <div className={`grid ${canAdjust ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
            <button
              type="button"
              onClick={() => setTipo("entrada")}
              className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-colors ${
                tipo === "entrada"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-white/[.08] text-gray-400 hover:text-[var(--nv-text)]"
              }`}
            >
              <ArrowDownCircle className="w-5 h-5" /> Entrada
            </button>
            <button
              type="button"
              onClick={() => setTipo("salida")}
              className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-colors ${
                tipo === "salida"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-white/[.08] text-gray-400 hover:text-[var(--nv-text)]"
              }`}
            >
              <ArrowUpCircle className="w-5 h-5" /> Salida
            </button>
            {canAdjust && (
              <button
                type="button"
                onClick={() => setTipo("ajuste")}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-colors ${
                  tipo === "ajuste"
                    ? "border-[#0f7eff]/40 bg-[#0f7eff]/10 text-[#99c9ff]"
                    : "border-white/[.08] text-gray-400 hover:text-[var(--nv-text)]"
                }`}
              >
                <SlidersHorizontal className="w-5 h-5" /> Ajuste
              </button>
            )}
          </div>

          {tipo === "ajuste" ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Diferencia (positiva suma, negativa resta) — existencia actual: {item.existencia}
              </label>
              <input
                autoFocus
                type="number"
                value={delta}
                onChange={e => setDelta(e.target.value)}
                placeholder="Ej. -3"
                className={fieldClass}
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Cantidad</label>
              <input
                autoFocus
                type="number"
                min={1}
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                placeholder="0"
                className={fieldClass}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Responsable</label>
              <input
                value={responsable}
                onChange={e => setResponsable(e.target.value)}
                placeholder="Opcional"
                className={fieldClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Nota</label>
              <input
                value={nota}
                onChange={e => setNota(e.target.value)}
                placeholder="Opcional"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">No. Pedido</label>
              <input
                value={numeroPedido}
                onChange={e => setNumeroPedido(e.target.value)}
                placeholder="Opcional"
                className={fieldClass}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[.08]">
          <button type="button" onClick={onClose} disabled={saving} className={btnGhost}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!valid || saving}
            onClick={() => onSubmit({ tipo, cantidad, delta, fecha, responsable, nota, numeroPedido })}
            className={btnPrimary}
          >
            {saving ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function movementTypeLabel(tipo: InventoryMovementType): string {
  switch (tipo) {
    case "entrada": return "Entrada";
    case "salida": return "Salida";
    case "ajuste": return "Ajuste";
    case "saldo_inicial": return "Saldo inicial";
  }
}
