"use client";

import type { CrmPipelineStage } from "@/types/crm";

interface StageFilterSheetProps {
  stages: CrmPipelineStage[];
  counts: Record<string, number>;
  totalCount: number;
  selectedStageId: string | null;
  onSelect: (stageId: string | null) => void;
  onClose: () => void;
}

export function StageFilterSheet({ stages, counts, totalCount, selectedStageId, onSelect, onClose }: StageFilterSheetProps) {
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Filtrar por etapa">
        <div className="sheet-handle" />
        <div className="sheet-title">Filtrar por etapa</div>

        <button
          type="button"
          className={`sheet-row${selectedStageId === null ? " current" : ""}`}
          onClick={() => onSelect(null)}
        >
          <span className="stage-dot stage-dot-all" />
          <span className="srow-name">Todas las etapas</span>
          <span className="srow-count">{totalCount}</span>
          {selectedStageId === null ? (
            <svg className="srow-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 13 4 4 10-10" />
            </svg>
          ) : null}
        </button>

        {stages.map(stage => {
          const isCurrent = stage.id === selectedStageId;
          return (
            <button
              key={stage.id}
              type="button"
              className={`sheet-row${isCurrent ? " current" : ""}`}
              onClick={() => onSelect(stage.id)}
            >
              <span className="stage-dot" style={{ backgroundColor: stage.color }} />
              <span className="srow-name">{stage.name}</span>
              <span className="srow-count">{counts[stage.id] ?? 0}</span>
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
