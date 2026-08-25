"use client";

import { useEffect, useState } from "react";
import { X, Package } from "lucide-react";
import { btnGhost, btnPrimary, nvControl } from "@/lib/brand-ui";
import type { InventoryItem } from "@/types/erp";

const fieldClass = `w-full ${nvControl} px-4 py-2.5 text-sm`;

export interface InventoryItemFormValues {
  codigo: string;
  nombre: string;
  marca: string;
  responsable: string;
  stock_minimo: string;
  existencia: string;
}

interface InventoryItemModalProps {
  open: boolean;
  item?: InventoryItem | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: InventoryItemFormValues) => void;
}

export function InventoryItemModal({ open, item, saving, error, onClose, onSubmit }: InventoryItemModalProps) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [marca, setMarca] = useState("");
  const [responsable, setResponsable] = useState("");
  const [stockMinimo, setStockMinimo] = useState("");
  const [existencia, setExistencia] = useState("");

  const isEdit = Boolean(item);

  useEffect(() => {
    if (!open) return;
    setCodigo(item?.codigo ?? "");
    setNombre(item?.nombre ?? "");
    setMarca(item?.marca ?? "");
    setResponsable(item?.responsable ?? "");
    setStockMinimo(item?.stockMinimo != null ? String(item.stockMinimo) : "");
    setExistencia("");
  }, [open, item]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-noova-surface border border-white/[.10] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-[#0f7eff]" />
            <h2 className="text-lg font-semibold text-[var(--nv-text)]">{isEdit ? "Editar producto" : "Nuevo producto"}</h2>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Código</label>
              <input
                autoFocus={!isEdit}
                disabled={isEdit}
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                placeholder="Ej. P480CU"
                className={`${fieldClass} font-mono disabled:opacity-50`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Marca</label>
              <input
                value={marca}
                onChange={e => setMarca(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Producto</label>
            <input
              autoFocus={isEdit}
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Nombre del producto"
              className={fieldClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Responsable</label>
              <input
                value={responsable}
                onChange={e => setResponsable(e.target.value)}
                placeholder="Opcional"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Stock mínimo</label>
              <input
                type="number"
                min={0}
                value={stockMinimo}
                onChange={e => setStockMinimo(e.target.value)}
                placeholder="Sin alerta"
                className={fieldClass}
              />
            </div>
          </div>
          {!isEdit && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Existencia inicial</label>
              <input
                type="number"
                value={existencia}
                onChange={e => setExistencia(e.target.value)}
                placeholder="0"
                className={fieldClass}
              />
              <p className="text-[11px] text-gray-600 mt-1">Se registra como un movimiento de saldo inicial, auditable en el kardex.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[.08]">
          <button type="button" onClick={onClose} disabled={saving} className={btnGhost}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!codigo.trim() || !nombre.trim() || saving}
            onClick={() => onSubmit({ codigo, nombre, marca, responsable, stock_minimo: stockMinimo, existencia })}
            className={btnPrimary}
          >
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear producto"}
          </button>
        </div>
      </div>
    </div>
  );
}
