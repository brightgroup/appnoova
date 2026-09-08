"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleGroupProps {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  publisher: string;
  description: string;
  /** Ej. "1 de 6 conectadas" — se muestra junto al chevron cuando el grupo está cerrado. */
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** Tarjeta de grupo expandible — mismo estilo visual que ConnectorCard, pero con subcontenido colapsable. */
export function CollapsibleGroup({
  icon,
  iconBg,
  name,
  publisher,
  description,
  summary,
  defaultOpen = false,
  children
}: CollapsibleGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-white/[.08] bg-black/20 overflow-hidden sm:col-span-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/[.03] transition-colors"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{name}</p>
          <p className="text-[11px] text-gray-500">{publisher}</p>
          <p className="text-xs text-gray-400 leading-relaxed mt-1">{description}</p>
        </div>
        <div className="shrink-0 flex items-center gap-2 pt-1">
          {summary && !open && <span className="text-[11px] text-gray-500 whitespace-nowrap">{summary}</span>}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && <div className="border-t border-white/[.08] divide-y divide-white/[.06]">{children}</div>}
    </div>
  );
}
