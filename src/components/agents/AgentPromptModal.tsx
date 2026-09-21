"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { modalOverlay } from "@/lib/brand-ui";

/**
 * Editor de instrucciones del agente en grande. El prompt ya no vive en el
 * panel lateral: se abre desde ahí con un botón y se edita aquí, con espacio
 * de verdad para leerlo. Controlado por el padre, igual que el editor que
 * tenía la pestaña de configuración, para que "Guardar cambios" siga
 * enviando el formulario completo.
 */
export function AgentPromptModal({
  open,
  onClose,
  subtitle,
  value,
  onChange,
  editorMode,
  onChangeEditorMode,
  guide,
  headerAction
}: {
  open: boolean;
  onClose: () => void;
  subtitle?: string;
  value: string;
  onChange: (value: string) => void;
  editorMode: "preview" | "markdown";
  onChangeEditorMode: (mode: "preview" | "markdown") => void;
  /** Guía de redacción opcional (la usa el agente de voz). */
  guide?: ReactNode;
  /** Acción extra en la cabecera, ej. "Restaurar plantilla". */
  headerAction?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={modalOverlay}
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--nv-border-strong)] bg-[var(--nv-bg-surface)] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--nv-border)] px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[var(--nv-text)]">Instrucciones</h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-[11.5px] text-[var(--nv-text-faint)]">{subtitle}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerAction}
            <div className="flex gap-1">
              {(["preview", "markdown"] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChangeEditorMode(mode)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    editorMode === mode
                      ? "bg-[var(--nv-bg-control-hover)] text-[var(--nv-text)]"
                      : "text-[var(--nv-text-faint)] hover:text-[var(--nv-text)]"
                  }`}
                >
                  {mode === "preview" ? "Vista previa" : "Markdown"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-lg p-1.5 text-[var(--nv-text-faint)] transition-colors hover:bg-[var(--nv-hover)] hover:text-[var(--nv-text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {guide && <div className="px-6 pt-4">{guide}</div>}

        <div className="min-h-0 flex-1 p-6">
          {editorMode === "markdown" ? (
            <textarea
              value={value}
              onChange={e => onChange(e.target.value)}
              spellCheck={false}
              className="h-full w-full resize-none rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg-control)] p-4 font-mono text-sm leading-relaxed text-[var(--nv-text)] focus:border-[#0f7eff]/40 focus:outline-none"
            />
          ) : (
            <div className="prose prose-invert prose-sm h-full w-full max-w-none overflow-y-auto rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg-control)] p-6">
              <PromptPreview text={value} />
            </div>
          )}
        </div>

        <div className="border-t border-[var(--nv-border)] px-6 py-3">
          <p className="text-[11.5px] text-[var(--nv-text-faint)]">
            Se guarda junto con el resto de la configuración, con “Guardar cambios”.
          </p>
        </div>
      </div>
    </div>
  );
}

function PromptPreview({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("# ")) return <h1 key={i} className="mt-4 mb-2 text-xl font-bold text-[var(--nv-text)]">{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i} className="mt-3 mb-1 text-lg font-semibold text-[var(--nv-text)]">{line.slice(3)}</h2>;
        if (line.startsWith("- ")) return <li key={i} className="ml-4 text-[var(--nv-text-muted)]">{line.slice(2)}</li>;
        if (line.trim() === "") return <br key={i} />;
        return <p key={i} className="mb-2 text-[var(--nv-text-muted)]">{line}</p>;
      })}
    </>
  );
}
