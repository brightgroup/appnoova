"use client";

import type { CrmPipelineStage } from "@/types/crm";

interface StageSheetProps {
  stages: CrmPipelineStage[];
  currentStageId: string;
  leadTitle: string;
  saving: boolean;
  error: string | null;
  onSelect: (stageId: string) => void;
  onClose: () => void;
}

export function StageSheet({ stages, currentStageId, leadTitle, saving, error, onSelect, onClose }: StageSheetProps) {
  return (
    <>
      <div className="sheet-scrim" onClick={saving ? undefined : onClose} />
      <div className="sheet" role="dialog" aria-label="Mover a etapa">
        <div className="sheet-handle" />
        <div className="sheet-title">Mover a etapa</div>
        <div className="sheet-subject">{leadTitle}</div>
        {error ? <p className="sheet-error">{error}</p> : null}
        {stages.map(stage => {
          const isCurrent = stage.id === currentStageId;
          return (
            <button
              key={stage.id}
              type="button"
              className={`sheet-row${isCurrent ? " current" : ""}`}
              disabled={saving || isCurrent}
              onClick={() => onSelect(stage.id)}
            >
              <span className="stage-dot" style={{ backgroundColor: stage.color }} />
              <span className="srow-name">{stage.name}</span>
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
