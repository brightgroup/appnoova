"use client";

import { useState } from "react";
import { X, Search, Package } from "lucide-react";
import { nvControl } from "@/lib/brand-ui";
import type { InventoryItem } from "@/types/erp";

interface ProductPickerModalProps {
  open: boolean;
  items: InventoryItem[];
  onClose: () => void;
  onSelect: (item: InventoryItem) => void;
}

/** Buscador simple de producto por código/nombre/marca — paso previo a registrar un movimiento desde una lista que no parte de un producto ya abierto. */
export function ProductPickerModal({ open, items, onClose, onSelect }: ProductPickerModalProps) {
  const [query, setQuery] = useState("");

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        i =>
          i.codigo.toLowerCase().includes(q) ||
          i.nombre.toLowerCase().includes(q) ||
          i.marca?.toLowerCase().includes(q)
      )
    : items;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-noova-surface border border-white/[.10] shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08] shrink-0">
          <h2 className="text-lg font-semibold text-[var(--nv-text)]">Elige un producto</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-3 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por código, producto o marca…"
              className={`w-full pl-9 pr-3 py-2.5 ${nvControl} text-sm`}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Sin resultados.</p>
          ) : (
            filtered.slice(0, 50).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[.06] text-left transition-colors"
              >
                <Package className="w-4 h-4 text-[#99c9ff] shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-[var(--nv-text)] truncate">{item.nombre}</div>
                  <div className="text-xs text-gray-500 font-mono">{item.codigo}{item.marca ? ` · ${item.marca}` : ""}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
