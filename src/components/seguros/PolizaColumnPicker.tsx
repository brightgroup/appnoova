"use client";

import { useState } from "react";
import { Columns3, Check, ChevronUp, ChevronDown } from "lucide-react";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { btnGhost } from "@/lib/brand-ui";
import type { PolizaColumnDef } from "@/lib/insurers/poliza-columns";

interface PolizaColumnPickerProps {
  ordered: PolizaColumnDef[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
}

/** Calcado de ExportMenu.tsx (mismo NoovaAnchoredMenu + botón fantasma) — administrar columnas visibles y su orden, persistido en localStorage (ver poliza-columns.ts). */
export function PolizaColumnPicker({ ordered, hidden, onToggle, onMove }: PolizaColumnPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <NoovaAnchoredMenu
      open={open}
      onClose={() => setOpen(false)}
      menuClassName="min-w-[240px] max-h-80 overflow-y-auto"
      anchor={
        <button type="button" onClick={() => setOpen(o => !o)} className={btnGhost}>
          <Columns3 className="w-4 h-4" /> Columnas
        </button>
      }
    >
      <div className="py-1">
        {ordered.map((col, i) => {
          const visible = !hidden.has(col.key);
          return (
            <div key={col.key} className="flex items-center gap-1 px-3 py-1.5 hover:bg-white/[.04]">
              <button
                type="button"
                onClick={() => onToggle(col.key)}
                className="flex items-center gap-2 flex-1 text-left text-sm text-gray-200"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${visible ? "bg-[#0f7eff] border-[#0f7eff]" : "border-white/20"}`}>
                  {visible && <Check className="w-3 h-3 text-white" />}
                </span>
                {col.label}
              </button>
              <button
                type="button"
                disabled={i === 0}
                onClick={() => onMove(col.key, -1)}
                className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={i === ordered.length - 1}
                onClick={() => onMove(col.key, 1)}
                className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </NoovaAnchoredMenu>
  );
}
