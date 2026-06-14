"use client";

import { MessageCircle, Mic, Paperclip, Smile } from "lucide-react";
import { renderNamedTemplatePreview } from "@/lib/whatsapp/template-record";

interface WhatsAppPhonePreviewProps {
  bodySource: string;
  variableNames: string[];
  variableExamples: string[];
  contactName?: string;
}

export function WhatsAppPhonePreview({
  bodySource,
  variableNames,
  variableExamples,
  contactName = "Contacto"
}: WhatsAppPhonePreviewProps) {
  const previewText =
    bodySource.trim().length > 0
      ? renderNamedTemplatePreview(bodySource, variableNames, variableExamples)
      : "Escribe el mensaje para ver la vista previa…";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[280px]">
        {/* Marco del teléfono */}
        <div className="rounded-[2rem] border border-white/[.12] bg-[#111318] p-2 shadow-2xl shadow-black/40">
          <div className="rounded-[1.5rem] overflow-hidden bg-[#0b141a]">
            {/* Notch */}
            <div className="h-6 bg-[#1f2c34] flex items-center justify-center">
              <div className="w-16 h-1 rounded-full bg-black/40" />
            </div>

            {/* Header WA */}
            <div className="flex items-center gap-3 px-3 py-2.5 bg-[#1f2c34] border-b border-black/20">
              <div className="w-8 h-8 rounded-full bg-[#5b5bf6]/30 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-[#a5a5ff]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{contactName}</p>
                <p className="text-[10px] text-emerald-400/80">en línea</p>
              </div>
            </div>

            {/* Chat */}
            <div
              className="px-3 py-4 min-h-[320px] max-h-[320px] overflow-y-auto"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 30%, rgba(91,91,246,0.04) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(16,185,129,0.03) 0%, transparent 50%)"
              }}
            >
              <div className="mx-auto max-w-[92%] mb-3">
                <div className="rounded-lg bg-[#1f2c34]/80 px-2 py-1.5 text-[10px] text-center text-[#8696a0] leading-snug">
                  Este chat es con una cuenta de negocio. Toca para saber más.
                </div>
              </div>

              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg rounded-tl-none bg-[#1f2c34] px-3 py-2 shadow-sm">
                  <p className="text-[13px] text-[#e9edef] whitespace-pre-wrap break-words leading-relaxed">
                    {previewText}
                  </p>
                  <p className="text-[10px] text-[#8696a0] text-right mt-1">12:00</p>
                </div>
              </div>
            </div>

            {/* Input bar */}
            <div className="flex items-center gap-2 px-2 py-2 bg-[#1f2c34] border-t border-black/20">
              <Smile className="w-4 h-4 text-[#8696a0]" />
              <div className="flex-1 rounded-full bg-[#2a3942] px-3 py-1.5 text-[11px] text-[#8696a0]">
                Mensaje
              </div>
              <Paperclip className="w-4 h-4 text-[#8696a0]" />
              <Mic className="w-4 h-4 text-[#8696a0]" />
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-4 text-center max-w-[280px]">
        Vista previa aproximada del mensaje en WhatsApp.
      </p>
    </div>
  );
}
