"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { CRM_STAGE_ICON_GROUPS, resolveCrmStageIcon } from "@/lib/crm-stage-icons";

interface CrmStageIconPickerProps {
  value: string | null;
  accentColor?: string;
  onChange: (icon: string) => void;
}

/**
 * Selector de ícono para etapas del pipeline — el trigger es un botón
 * circular compacto (cabe en la fila apretada de configuración de etapas),
 * pero se abre en un modal grande y buscable (pedido explícito del usuario:
 * "biblioteca más amplia de iconos... que se abra en un modal más bonito"),
 * en vez del popover chico original.
 */
export function CrmStageIconPicker({ value, accentColor = "#0f7eff", onChange }: CrmStageIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const SelectedIcon = resolveCrmStageIcon(value);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CRM_STAGE_ICON_GROUPS;
    return CRM_STAGE_ICON_GROUPS.map(g => ({
      ...g,
      icons: g.icons.filter(name => name.toLowerCase().includes(q))
    })).filter(g => g.icons.length > 0);
  }, [query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Elegir ícono"
        className="w-9 h-9 rounded-lg bg-white/[.08] flex items-center justify-center shrink-0 border border-white/[.10] hover:border-white/[.20] transition-colors"
      >
        <SelectedIcon className="w-4 h-4" style={{ color: accentColor }} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-white/[.12] bg-[#13141c] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[.08]">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-white/[.08] flex items-center justify-center shrink-0">
                  <SelectedIcon className="w-4 h-4" style={{ color: accentColor }} />
                </span>
                <h2 className="text-base font-semibold text-white">Elegir ícono</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/[.08] text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-white/[.08]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar ícono…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/[.04] border border-white/[.12] text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {filteredGroups.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-10">Ningún ícono coincide con &quot;{query}&quot;.</p>
              ) : (
                filteredGroups.map(group => (
                  <div key={group.label}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">{group.label}</p>
                    <div className="grid grid-cols-7 sm:grid-cols-8 gap-2">
                      {group.icons.map(name => {
                        const Icon = resolveCrmStageIcon(name);
                        const selected = name === value;
                        return (
                          <button
                            key={name}
                            type="button"
                            title={name}
                            onClick={() => {
                              onChange(name);
                              setOpen(false);
                              setQuery("");
                            }}
                            className={`relative flex items-center justify-center aspect-square rounded-xl bg-white/[.08] transition-colors ${
                              selected ? "ring-2 ring-offset-2 ring-offset-[#13141c]" : "hover:bg-white/[.14]"
                            }`}
                            style={selected ? ({ "--tw-ring-color": accentColor } as React.CSSProperties) : undefined}
                          >
                            <Icon className="w-5 h-5" style={{ color: selected ? accentColor : "#a1a1aa" }} />
                            {selected && (
                              <span
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: accentColor }}
                              >
                                <Check className="w-2.5 h-2.5 text-white" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
