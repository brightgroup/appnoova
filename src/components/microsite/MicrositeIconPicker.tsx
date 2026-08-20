"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { MICROSITE_ICON_OPTIONS, resolveMicrositeIcon } from "@/lib/microsite-icons";
import { registryListShell } from "@/lib/brand-ui";

interface MicrositeIconPickerProps {
  value: string;
  accentColor?: string;
  onChange: (icon: string) => void;
}

export function MicrositeIconPicker({ value, accentColor = "#0f7eff", onChange }: MicrositeIconPickerProps) {
  const [open, setOpen] = useState(false);
  const SelectedIcon = resolveMicrositeIcon(value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[.04] border border-white/[.10] hover:border-white/[.18] text-left"
      >
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
        >
          <SelectedIcon className="w-4 h-4" />
        </span>
        <span className="text-sm text-gray-200 flex-1">{value}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="Cerrar selector de iconos"
            onClick={() => setOpen(false)}
          />
          <div className={`absolute z-50 mt-2 w-full max-h-56 overflow-y-auto ${registryListShell} p-3`}>
            <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2 px-1">Biblioteca de iconos</p>
            <div className="grid grid-cols-5 gap-1.5">
              {MICROSITE_ICON_OPTIONS.map(name => {
                const Icon = resolveMicrositeIcon(name);
                const selected = name === value;
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => { onChange(name); setOpen(false); }}
                    className={`relative flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${
                      selected
                        ? "bg-[#0f7eff]/20 ring-1 ring-[#0f7eff]/50"
                        : "hover:bg-white/[.06]"
                    }`}
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: selected ? `${accentColor}33` : "rgba(255,255,255,0.04)",
                        color: selected ? accentColor : "#a1a1aa"
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-[9px] text-gray-500 truncate w-full text-center leading-tight">
                      {name.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                    {selected && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#0f7eff] flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
