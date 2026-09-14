"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleCardProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** Tarjeta con header plegable — mismo estilo de tarjeta que el resto de la ficha del lead, pero colapsada por defecto para bajar el ruido visual en secciones secundarias. */
export function CollapsibleCard({ title, icon, defaultOpen = false, children }: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-white/[.08] bg-white/[.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-5 py-3.5 text-left hover:bg-white/[.02] transition-colors"
      >
        {icon}
        <span className="text-sm font-semibold text-white flex-1">{title}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t border-white/[.06]">{children}</div>}
    </div>
  );
}
