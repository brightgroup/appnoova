"use client";

import { useEffect, useState } from "react";
import { X, ArrowDownCircle, ArrowUpCircle, Plus, Trash2, Search, Package } from "lucide-react";
import { btnGhost, btnPrimary, nvControl } from "@/lib/brand-ui";
import type { InventoryItem } from "@/types/erp";

const fieldClass = `w-full ${nvControl} px-4 py-2.5 text-sm`;

interface BatchLine {
  key: string;
  item: InventoryItem | null;
  cantidad: string;
  query: string;
}

function emptyLine(): BatchLine {
  return { key: Math.random().toString(36).slice(2), item: null, cantidad: "", query: "" };
}

export interface BatchMovementValues {
  tipo: "entrada" | "salida";
  numeroPedido: string;
  fecha: string;
  responsable: string;
  nota: string;
  lines: { itemId: string; cantidad: number }[];
}

interface BatchMovementModalProps {
  open: boolean;
  items: InventoryItem[];
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: BatchMovementValues) => void;
}

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Registra varios productos (entrada o salida) bajo un mismo número de
 * pedido, para cuando una sola orden mueve varios artículos a la vez.
 */
export function BatchMovementModal({ open, items, saving, error, onClose, onSubmit }: BatchMovementModalProps) {
  const [tipo, setTipo] = useState<"entrada" | "salida">("entrada");
  const [numeroPedido, setNumeroPedido] = useState("");
  const [fecha, setFecha] = useState(TODAY());
  const [responsable, setResponsable] = useState("");
  const [nota, setNota] = useState("");
  const [lines, setLines] = useState<BatchLine[]>([emptyLine()]);
  const [openPickerKey, setOpenPickerKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTipo("entrada");
    setNumeroPedido("");
    setFecha(TODAY());
    setResponsable("");
    setNota("");
    setLines([emptyLine()]);
    setOpenPickerKey(null);
  }, [open]);

  if (!open) return null;

  const usedIds = new Set(lines.map(l => l.item?.id).filter(Boolean));

  function updateLine(key: string, patch: Partial<BatchLine>) {
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines(prev => (prev.length > 1 ? prev.filter(l => l.key !== key) : prev));
  }

  const valid =
    lines.length > 0 &&
    lines.every(l => l.item && Number(l.cantidad) > 0 && Number.isInteger(Number(l.cantidad)));

  function submit() {
    onSubmit({
      tipo,
      numeroPedido,
      fecha,
      responsable,
      nota,
      lines: lines.map(l => ({ itemId: l.item!.id, cantidad: Number(l.cantidad) }))
    });
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-noova-surface border border-white/[.10] shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08] shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-[var(--nv-text)]">Registrar movimiento por pedido</h2>
            <p className="text-xs text-gray-500 mt-0.5">Varios productos bajo un mismo número de pedido</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo("entrada")}
              className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-colors ${
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
              className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-colors ${
                tipo === "salida"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-white/[.08] text-gray-400 hover:text-[var(--nv-text)]"
              }`}
            >
              <ArrowUpCircle className="w-5 h-5" /> Salida
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">No. Pedido</label>
              <input
                value={numeroPedido}
                onChange={e => setNumeroPedido(e.target.value)}
                placeholder="Opcional"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={fieldClass} />
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

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nota</label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional" className={fieldClass} />
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-gray-500">Productos</label>
            {lines.map(line => {
              const q = line.query.trim().toLowerCase();
              const results = q
                ? items
                    .filter(i => !usedIds.has(i.id) || i.id === line.item?.id)
                    .filter(
                      i =>
                        i.codigo.toLowerCase().includes(q) ||
                        i.nombre.toLowerCase().includes(q) ||
                        i.marca?.toLowerCase().includes(q)
                    )
                    .slice(0, 20)
                : [];

              return (
                <div key={line.key} className="flex items-start gap-2">
                  <div className="relative flex-1">
                    {line.item ? (
                      <div className={`flex items-center justify-between ${fieldClass}`}>
                        <div className="min-w-0">
                          <div className="text-sm text-[var(--nv-text)] truncate">{line.item.nombre}</div>
                          <div className="text-xs text-gray-500 font-mono">{line.item.codigo}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateLine(line.key, { item: null, query: "" })}
                          className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400 shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            value={line.query}
                            onChange={e => {
                              updateLine(line.key, { query: e.target.value });
                              setOpenPickerKey(line.key);
                            }}
                            onFocus={() => setOpenPickerKey(line.key)}
                            placeholder="Buscar por código, producto o marca…"
                            className={`w-full pl-9 pr-3 py-2.5 ${nvControl} text-sm`}
                          />
                        </div>
                        {openPickerKey === line.key && results.length > 0 && (
                          <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-white/[.10] bg-noova-surface shadow-2xl">
                            {results.map(i => (
                              <button
                                key={i.id}
                                type="button"
                                onClick={() => {
                                  updateLine(line.key, { item: i, query: "" });
                                  setOpenPickerKey(null);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[.06] text-left"
                              >
                                <Package className="w-4 h-4 text-[#99c9ff] shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-sm text-[var(--nv-text)] truncate">{i.nombre}</div>
                                  <div className="text-xs text-gray-500 font-mono">
                                    {i.codigo}
                                    {i.marca ? ` · ${i.marca}` : ""}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={line.cantidad}
                    onChange={e => updateLine(line.key, { cantidad: e.target.value })}
                    placeholder="Cant."
                    className={`w-24 ${nvControl} px-3 py-2.5 text-sm`}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                    className="p-2.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:pointer-events-none shrink-0"
                    title="Quitar línea"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setLines(prev => [...prev, emptyLine()])}
              className="flex items-center gap-1.5 text-xs text-[#99c9ff] hover:text-white px-2 py-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar producto
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[.08] shrink-0">
          <button type="button" onClick={onClose} disabled={saving} className={btnGhost}>
            Cancelar
          </button>
          <button type="button" disabled={!valid || saving} onClick={submit} className={btnPrimary}>
            {saving ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
