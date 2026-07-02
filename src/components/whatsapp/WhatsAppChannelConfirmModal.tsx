"use client";

import { Loader2 } from "lucide-react";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

export type WhatsAppChannelConfirmAction = "disconnect" | "delete";

interface WhatsAppChannelConfirmModalProps {
  channel: WhatsAppChannelRecord | null;
  action: WhatsAppChannelConfirmAction | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function WhatsAppChannelConfirmModal({
  channel,
  action,
  loading = false,
  onClose,
  onConfirm
}: WhatsAppChannelConfirmModalProps) {
  if (!channel || !action) return null;

  const isDelete = action === "delete";
  const title = isDelete ? "Eliminar línea" : "Desconectar línea";
  const lineLabel = channel.friendly_name || "WhatsApp";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#13141c] border border-white/[.10] rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
        <p className="text-sm font-mono text-gray-300 mb-3">{channel.e164}</p>
        <p className="text-sm text-gray-400 leading-relaxed">
          {isDelete ? (
            <>
              Se eliminará <strong className="text-white">{lineLabel}</strong> del listado de Noova.
              Las plantillas asociadas también se borran. Tu número de WhatsApp no se modifica.
            </>
          ) : (
            <>
              <strong className="text-white">{lineLabel}</strong> dejará de recibir y enviar mensajes en Noova.
              Podrás reconectarla o eliminarla después.
            </>
          )}
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/[.06] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 flex items-center gap-2 ${
              isDelete ? "bg-red-600 hover:bg-red-500" : "bg-[var(--nv-accent)] hover:bg-[var(--nv-accent-hover)] text-[#1a202c]"
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? (isDelete ? "Eliminando…" : "Desconectando…") : isDelete ? "Eliminar" : "Desconectar"}
          </button>
        </div>
      </div>
    </div>
  );
}
