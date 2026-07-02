"use client";

import { Link2, Loader2, Trash2, Unplug } from "lucide-react";
import { btnGhost, btnPrimary } from "@/lib/brand-ui";
import {
  canDeleteWhatsAppChannel,
  canDisconnectWhatsAppChannel,
  isWhatsAppChannelDisconnected,
  whatsAppChannelStatusLabel
} from "@/lib/whatsapp/channel-status";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

interface WhatsAppChannelLifecycleSectionProps {
  channel: WhatsAppChannelRecord;
  embeddedSignupEnabled: boolean;
  disconnecting?: boolean;
  deleting?: boolean;
  onDisconnect: () => void;
  onReconnect: () => void;
  onDelete: () => void;
}

export function WhatsAppChannelLifecycleSection({
  channel,
  embeddedSignupEnabled,
  disconnecting = false,
  deleting = false,
  onDisconnect,
  onReconnect,
  onDelete
}: WhatsAppChannelLifecycleSectionProps) {
  const disconnected = isWhatsAppChannelDisconnected(channel);
  const canDisconnect = canDisconnectWhatsAppChannel(channel);
  const canDelete = canDeleteWhatsAppChannel(channel);
  const status = whatsAppChannelStatusLabel(channel);

  const connectedStep: StepState = canDisconnect ? "active" : disconnected ? "done" : "idle";
  const disconnectedStep: StepState = disconnected ? "active" : "idle";
  const deletedStep: StepState = canDelete ? "active" : "idle";

  return (
    <div className="rounded-xl border border-white/[.10] bg-white/[.02] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[.08]">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Gestión de la línea</p>
        <p className="text-sm text-gray-300 mt-1">
          {canDisconnect
            ? "Para quitar la línea de Noova, primero desconéctala y luego elimínala."
            : disconnected
              ? "Línea desconectada. Puedes reconectarla o eliminarla del listado."
              : "Esta línea aún no está activa. Puedes eliminarla si ya no la necesitas."}
        </p>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="flex items-center gap-3 text-xs">
          <Step variant="connected" state={connectedStep} label="Conectada" />
          <StepLine highlight={disconnected} />
          <Step variant="disconnected" state={disconnectedStep} label="Desconectada" />
          <StepLine muted />
          <Step variant="deleted" state={deletedStep} label="Eliminada" />
        </div>

        <div className="rounded-lg border border-white/[.08] bg-black/20 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Estado actual</p>
            <p className="text-sm font-medium text-white mt-0.5">{status}</p>
          </div>
          <span
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase ${
              canDisconnect
                ? "bg-emerald-500/15 text-emerald-300"
                : disconnected
                  ? "bg-[var(--nv-hubspot-teal)]/15 text-[var(--nv-hubspot-teal)]"
                  : "bg-[var(--nv-accent)]/15 text-[var(--nv-hubspot-teal)]"
            }`}
          >
            {canDisconnect ? "En uso" : disconnected ? "Inactiva" : "Pendiente"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {canDisconnect && (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={disconnecting}
              className={`${btnGhost} border border-[var(--nv-hubspot-teal)]/30 text-[var(--nv-hubspot-teal)] hover:bg-[var(--nv-hubspot-teal-soft)]`}
            >
              {disconnecting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Desconectando…</>
              ) : (
                <><Unplug className="w-4 h-4" /> Desconectar</>
              )}
            </button>
          )}

          {disconnected && embeddedSignupEnabled && (
            <button type="button" onClick={onReconnect} className={btnPrimary}>
              <Link2 className="w-4 h-4" /> Reconectar
            </button>
          )}

          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className={`${btnGhost} border border-red-500/25 text-red-300 hover:bg-red-500/10`}
            >
              {deleting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Eliminando…</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Eliminar línea</>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled
              title="Desconecta la línea primero"
              className={`${btnGhost} opacity-40 cursor-not-allowed border border-white/[.06] text-gray-500`}
            >
              <Trash2 className="w-4 h-4" /> Eliminar línea
            </button>
          )}
        </div>

        {canDisconnect && (
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Desconectar deja de recibir y enviar mensajes desde Noova. No elimina tu número de WhatsApp.
          </p>
        )}
        {canDelete && !canDisconnect && (
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Eliminar quita la línea del listado y borra las plantillas asociadas en Noova.
          </p>
        )}
      </div>
    </div>
  );
}

type StepVariant = "connected" | "disconnected" | "deleted";
type StepState = "idle" | "active" | "done";

function stepDotClass(variant: StepVariant, state: StepState): string {
  if (state === "idle") {
    return variant === "deleted" ? "bg-red-950/40 ring-1 ring-red-500/20" : "bg-white/10";
  }

  if (variant === "connected") {
    return state === "done" || state === "active" ? "bg-emerald-400" : "bg-white/10";
  }
  if (variant === "disconnected") {
    return "bg-[var(--nv-hubspot-teal)]";
  }
  return "bg-red-500";
}

function Step({
  variant,
  state,
  label
}: {
  variant: StepVariant;
  state: StepState;
  label: string;
}) {
  const lit = state !== "idle";
  return (
    <div className="flex flex-col items-center gap-1 min-w-[4.5rem]">
      <div className={`w-2 h-2 rounded-full transition-colors ${stepDotClass(variant, state)}`} />
      <span className={`text-[10px] ${lit ? "text-gray-300" : "text-gray-600"}`}>{label}</span>
    </div>
  );
}

function StepLine({ highlight, muted }: { highlight?: boolean; muted?: boolean }) {
  return (
    <div
      className={`flex-1 h-px min-w-[1.5rem] mb-4 ${
        muted ? "bg-white/[.06]" : highlight ? "bg-[var(--nv-hubspot-teal)]/35" : "bg-white/[.12]"
      }`}
    />
  );
}
