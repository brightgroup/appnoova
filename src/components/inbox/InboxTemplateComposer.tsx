"use client";

import Link from "next/link";
import { tagNeonAmber } from "@/lib/brand-ui";
import { FileText, Loader2, MessageCircle, Send } from "lucide-react";
import type { WhatsAppTemplateRecord } from "@/types/whatsapp-template";

interface InboxTemplateComposerProps {
  templates: WhatsAppTemplateRecord[];
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  variableValues: string[];
  onVariableChange: (index: number, value: string) => void;
  previewText: string;
  sending: boolean;
  onSend: () => void;
  canSend: boolean;
}

export function InboxTemplateComposer({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  variableValues,
  onVariableChange,
  previewText,
  sending,
  onSend,
  canSend
}: InboxTemplateComposerProps) {
  const selected = templates.find(t => t.id === selectedTemplateId) ?? null;
  const varsComplete =
    !selected ||
    selected.variable_labels.length === 0 ||
    selected.variable_labels.length === variableValues.filter(v => v.trim()).length;

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <p className={`rounded-lg px-3 py-1.5 text-xs ${tagNeonAmber}`}>
        Ventana de 24 h cerrada — elige una plantilla aprobada y completa las variables.
      </p>

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/35">Plantillas disponibles</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {templates.map(tpl => {
            const active = tpl.id === selectedTemplateId;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onSelectTemplate(tpl.id)}
                className={`rounded-xl border px-3 py-3 text-left transition-all ${
                  active
                    ? "border-[#5b5bf6]/50 bg-[var(--nv-accent-muted)] shadow-[0_0_20px_rgba(91,91,246,0.12)]"
                    : "border-[var(--nv-input-border)] bg-[var(--nv-bg-control)] hover:border-[var(--nv-border-strong)] hover:bg-[var(--nv-bg-control-hover)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className={`h-4 w-4 shrink-0 ${active ? "text-[#a5a5ff]" : "text-white/40"}`} />
                  <span className="truncate text-sm font-medium text-white">{tpl.template_name}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/45">
                  {tpl.body_source ?? tpl.body_preview}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {selected && selected.variable_labels.length > 0 && (
        <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-bg-elevated)] p-4 space-y-3">
          <p className="text-xs font-medium text-[var(--nv-text-muted)]">Variables del mensaje</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {selected.variable_labels.map((label, i) => (
              <div key={`${label}-${i}`}>
                <label className="mb-1.5 block text-xs font-mono text-[var(--nv-accent-text-soft)]">{label}</label>
                <input
                  value={variableValues[i] ?? ""}
                  onChange={e => onVariableChange(i, e.target.value)}
                  placeholder={`Valor para ${label}`}
                  className="w-full rounded-xl border border-[var(--nv-input-border)] bg-[var(--nv-bg-control)] px-3 py-2.5 text-sm text-[var(--nv-text)] placeholder-[var(--nv-text-faint)] focus:border-[#5b5bf6]/40 focus:outline-none focus:ring-1 focus:ring-[#5b5bf6]/20"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="flex justify-center">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-bg-chat)] p-4">
            <div className="mb-3 flex items-center gap-2 text-xs text-[var(--nv-text-faint)]">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
              Vista previa
            </div>
            <div className="rounded-xl rounded-tl-sm border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3 py-2.5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--nv-text)]">{previewText}</p>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onSend}
        disabled={!selectedTemplateId || !varsComplete || sending || !canSend}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5b5bf6] px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#7070f8] disabled:opacity-40"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Send className="h-4 w-4" />
            Enviar plantilla
          </>
        )}
      </button>

      {templates.length === 0 && (
        <p className="text-center text-xs text-white/40">
          No tienes plantillas aprobadas.{" "}
          <Link href="/dashboard/canales/whatsapp/plantillas" className="text-[#a5a5ff] hover:underline">
            Crear plantillas
          </Link>
        </p>
      )}
    </div>
  );
}
