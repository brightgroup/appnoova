"use client";

import { AlertTriangle } from "lucide-react";
import {
  toolProductRows,
  toolMovementRows,
  toolTruncationCaption,
  type OriToolCall
} from "@/types/ori";

/**
 * Renderiza los resultados de las tools de Ori como tabla real — los números
 * que ve el cliente salen directo de la respuesta de la base de datos, nunca
 * de lo que el modelo haya redactado. El texto del modelo sigue siendo el
 * comentario alrededor; esto es la fuente de verdad visual.
 */
export function OriToolResultView({ toolCalls }: { toolCalls: OriToolCall[] }) {
  if (!toolCalls.length) return null;

  return (
    <div className="mt-3 space-y-3">
      {toolCalls.map((call, i) => {
        const productos = toolProductRows(call);
        const movimientos = toolMovementRows(call);
        const caption = toolTruncationCaption(call);

        if (productos.length > 0) {
          return (
            <div key={i} className="rounded-xl border border-white/[.08] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[.08] text-gray-500">
                    <th className="px-3 py-2 text-left font-medium">Código</th>
                    <th className="px-3 py-2 text-left font-medium">Producto</th>
                    <th className="px-3 py-2 text-right font-medium">Existencia</th>
                    <th className="px-3 py-2 text-right font-medium">Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.codigo} className="border-b border-white/[.04] last:border-0">
                      <td className="px-3 py-1.5 font-mono text-gray-400 whitespace-nowrap">{p.codigo}</td>
                      <td className="px-3 py-1.5 text-gray-200">{p.nombre}</td>
                      <td className={`px-3 py-1.5 text-right font-mono ${p.bajo_minimo ? "text-amber-300" : "text-gray-200"}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {p.bajo_minimo && <AlertTriangle className="w-3 h-3" />}
                          {p.existencia}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-500">{p.stock_minimo ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {caption && <p className="px-3 py-1.5 text-[11px] text-gray-500 border-t border-white/[.06]">{caption}</p>}
            </div>
          );
        }

        if (movimientos.length > 0) {
          return (
            <div key={i} className="rounded-xl border border-white/[.08] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[.08] text-gray-500">
                    <th className="px-3 py-2 text-left font-medium">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium">Producto</th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m, idx) => (
                    <tr key={idx} className="border-b border-white/[.04] last:border-0">
                      <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">{m.fecha}</td>
                      <td className="px-3 py-1.5 text-gray-200">{m.producto}</td>
                      <td className="px-3 py-1.5 text-gray-400">{m.tipo}</td>
                      <td className={`px-3 py-1.5 text-right font-mono ${m.cantidad > 0 ? "text-emerald-300" : "text-amber-300"}`}>
                        {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-200">{m.saldo_resultante}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {caption && <p className="px-3 py-1.5 text-[11px] text-gray-500 border-t border-white/[.06]">{caption}</p>}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
