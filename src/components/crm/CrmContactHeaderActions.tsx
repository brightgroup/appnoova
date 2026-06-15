"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Inbox,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Plus,
  Sparkles
} from "lucide-react";
import { btnGhost, btnPrimarySm } from "@/lib/brand-ui";
import { VENTANA_WA_LABELS } from "@/lib/crm-contactability";
import type { CrmContact } from "@/types/crm";

interface CrmContactHeaderActionsProps {
  contact: CrmContact;
  contactId: string;
  onCall?: () => void;
  callBusy?: boolean;
  onQuote?: () => void;
  quoteBusy?: boolean;
}

export function CrmContactHeaderActions({
  contact,
  contactId,
  onCall,
  callBusy,
  onQuote,
  quoteBusy
}: CrmContactHeaderActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const actions = contact.actions;
  const wa = actions?.whatsapp;
  const call = actions?.call;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const waHref = contact.inbox_conversation_id && wa?.allowed
    ? `/dashboard/inbox?id=${contact.inbox_conversation_id}`
    : null;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border ${
          contact.ventana_wa_estado === "abierta"
            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20"
            : contact.ventana_wa_estado === "requiere_plantilla"
              ? "bg-amber-500/15 text-amber-300 border-amber-500/20"
              : "bg-white/[.06] text-gray-400 border-white/[.08]"
        }`}
        title={VENTANA_WA_LABELS[contact.ventana_wa_estado]}
      >
        {contact.ventana_wa_estado === "abierta" ? "WA 24h" : contact.ventana_wa_estado === "requiere_plantilla" ? "WA HSM" : "WA —"}
      </span>

      {waHref ? (
        <Link href={waHref} className={btnPrimarySm}>
          <MessageSquare className="w-3.5 h-3.5" />
          {wa?.mode === "template" ? "Plantilla" : "WhatsApp"}
        </Link>
      ) : (
        <button type="button" disabled className={`${btnPrimarySm} opacity-40 cursor-not-allowed`} title={wa?.reason ?? undefined}>
          <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
        </button>
      )}

      <div className="relative" ref={menuRef}>
        <button type="button" onClick={() => setMenuOpen(o => !o)} className={btnGhost}>
          <MoreHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline text-xs">Acciones</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] rounded-xl border border-white/[.12] bg-[#1a1a1f] py-1 shadow-xl">
            <button
              type="button"
              disabled={!call?.allowed || callBusy}
              onClick={() => { setMenuOpen(false); onCall?.(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-gray-200 hover:bg-white/[.06] disabled:opacity-40"
            >
              {callBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
              Llamada IA
            </button>
            <Link
              href={`/dashboard/crm/leads/nuevo?contact_id=${contactId}`}
              onClick={() => setMenuOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-white/[.06]"
            >
              <Plus className="w-3.5 h-3.5" /> Crear lead
            </Link>
            <button
              type="button"
              disabled={quoteBusy}
              onClick={() => { setMenuOpen(false); onQuote?.(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-white/[.06] disabled:opacity-40"
            >
              {quoteBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Cotización ORI
            </button>
            {contact.inbox_conversation_id && (
              <Link
                href={`/dashboard/inbox?id=${contact.inbox_conversation_id}`}
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-white/[.06]"
              >
                <Inbox className="w-3.5 h-3.5" /> Abrir inbox
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
