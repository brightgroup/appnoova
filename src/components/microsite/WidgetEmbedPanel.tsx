"use client";

import { Copy, Code2 } from "lucide-react";

export function WidgetEmbedPanel({
  embedSnippet,
  isPublished,
  hasAgent,
  copied,
  onCopy
}: {
  embedSnippet: string;
  isPublished: boolean;
  hasAgent: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const ready = isPublished && hasAgent && embedSnippet;

  return (
    <div className="rounded-xl border border-white/[.10] bg-white/[.02] p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
          <Code2 className="w-4 h-4 text-cyan-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Código de instalación
          </p>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            Pegue este código antes de <code className="text-gray-400">&lt;/body&gt;</code> en su sitio web.
            Las conversaciones llegan al inbox como{" "}
            <span className="text-gray-300">Widget web</span>.
          </p>
          {ready ? (
            <>
              <pre className="text-[11px] font-mono text-gray-300 bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-white/[.06]">
                {embedSnippet}
              </pre>
              <button
                type="button"
                onClick={onCopy}
                className="flex items-center gap-1 mt-2.5 text-[11px] text-[#5b5bf6] hover:text-[#a5a5ff]"
              >
                <Copy className="w-3 h-3" />
                {copied ? "Copiado" : "Copiar código"}
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-600">
              {!hasAgent
                ? "Asigne un agente de texto para generar el código."
                : "Publique el widget para activar el código."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
