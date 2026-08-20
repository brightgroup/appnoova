"use client";

import { useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Variable } from "lucide-react";
import { renderCampaignPrompt } from "@/lib/campaigns/render-prompt";
import type { CampaignVariable } from "@/types/voice-campaign";

interface CampaignPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables: CampaignVariable[];
  sampleValues?: Record<string, string>;
}

export function CampaignPromptEditor({
  value,
  onChange,
  variables,
  sampleValues,
}: CampaignPromptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [menu, setMenu] = useState<{ start: number; query: string } | null>(null);

  const filtered = useMemo(() => {
    if (!menu) return variables;
    const q = menu.query.toLowerCase();
    return variables.filter(
      v => v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q)
    );
  }, [menu, variables]);

  const detectSlash = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const slashIdx = before.lastIndexOf("/");
    if (slashIdx === -1) {
      setMenu(null);
      return;
    }
    const prevChar = slashIdx > 0 ? before[slashIdx - 1] : " ";
    const query = before.slice(slashIdx + 1);
    if (/[a-zA-Z0-9_ ]/.test(prevChar) && prevChar !== " " && prevChar !== "\n") {
      setMenu(null);
      return;
    }
    if (/\s/.test(query)) {
      setMenu(null);
      return;
    }
    setMenu({ start: slashIdx, query });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    onChange(text);
    detectSlash(text, e.target.selectionStart ?? text.length);
  };

  const insertToken = (key: string, replaceSlash = false) => {
    const el = textareaRef.current;
    const token = `{{${key}}}`;
    if (!el) {
      onChange(value + token);
      setMenu(null);
      return;
    }
    const caret = el.selectionStart ?? value.length;
    let start = caret;
    let end = caret;
    if (replaceSlash && menu) {
      start = menu.start;
      end = menu.start + 1 + menu.query.length;
    }
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    setMenu(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const preview = useMemo(
    () => (sampleValues ? renderCampaignPrompt(value, sampleValues) : value),
    [value, sampleValues]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Variable className="w-3.5 h-3.5 text-[#99c9ff]" />
          Escribe <code className="text-[#99c9ff]">/</code> para insertar una variable
        </p>
        {sampleValues && (
          <button
            type="button"
            onClick={() => setShowPreview(p => !p)}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-400 hover:text-white"
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPreview ? "Editar" : "Vista previa"}
          </button>
        )}
      </div>

      {variables.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {variables.map(v => (
            <button
              key={v.key}
              type="button"
              onClick={() => insertToken(v.key)}
              title={v.label}
              className="text-[11px] px-2 py-1 rounded-md border border-[#0f7eff]/25 bg-[#072b55]/60 text-[#2f8fff] hover:bg-[#072b55]/80 transition-colors"
            >
              {`{{${v.key}}}`}
            </button>
          ))}
        </div>
      )}

      {showPreview ? (
        <div className="w-full min-h-[280px] rounded-lg border border-white/[.10] bg-white/[.02] px-4 py-3 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
          {preview || <span className="text-gray-600">Sin contenido</span>}
        </div>
      ) : (
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={e => {
              if (menu && e.key === "Escape") {
                e.preventDefault();
                setMenu(null);
              }
              if (menu && filtered.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
                e.preventDefault();
                insertToken(filtered[0].key, true);
              }
            }}
            onBlur={() => setTimeout(() => setMenu(null), 150)}
            spellCheck={false}
            placeholder="Escribe el guion de la llamada. Usa / para insertar variables como el nombre del contacto…"
            className="w-full min-h-[280px] rounded-lg border border-white/[.10] bg-white/[.02] px-4 py-3 text-sm text-gray-200 font-mono leading-relaxed resize-y focus:outline-none focus:border-[#0f7eff]/50"
          />

          {menu && filtered.length > 0 && (
            <div className="absolute left-4 top-14 z-20 w-64 max-h-56 overflow-y-auto rounded-lg border border-white/[.12] bg-noova-surface shadow-2xl py-1">
              {filtered.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault();
                    insertToken(v.key, true);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/[.06]"
                >
                  <span className="text-sm text-white truncate">{v.label}</span>
                  <span className="text-[11px] text-[#99c9ff] shrink-0">{`{{${v.key}}}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {variables.length === 0 && (
        <p className="text-[11px] text-amber-300/80">
          Importa una audiencia y mapea las columnas para tener variables disponibles.
        </p>
      )}
    </div>
  );
}
