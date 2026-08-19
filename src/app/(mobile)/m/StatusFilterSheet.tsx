"use client";

import type { CrmLeadFilter } from "@/types/crm";

const OPTIONS: { id: CrmLeadFilter; label: string }[] = [
  { id: "open", label: "Abiertos" },
  { id: "mine", label: "Míos" },
  { id: "won", label: "Ganados" },
  { id: "lost", label: "Perdidos" },
  { id: "all", label: "Todos" }
];

interface StatusFilterSheetProps {
  counts: Record<CrmLeadFilter, number>;
  selected: CrmLeadFilter;
  onSelect: (filter: CrmLeadFilter) => void;
  onClose: () => void;
}

export function StatusFilterSheet({ counts, selected, onSelect, onClose }: StatusFilterSheetProps) {
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Filtrar por estado">
        <div className="sheet-handle" />
        <div className="sheet-title">Filtrar por estado</div>

        {OPTIONS.map(opt => {
          const isCurrent = opt.id === selected;
          return (
            <button
              key={opt.id}
              type="button"
              className={`sheet-row${isCurrent ? " current" : ""}`}
              onClick={() => onSelect(opt.id)}
            >
              <span className="srow-name">{opt.label}</span>
              <span className="srow-count">{counts[opt.id] ?? 0}</span>
              {isCurrent ? (
                <svg className="srow-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 13 4 4 10-10" />
                </svg>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}
