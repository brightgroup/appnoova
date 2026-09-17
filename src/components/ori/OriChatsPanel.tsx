"use client";

import { MessageSquarePlus, Trash2, X } from "lucide-react";
import type { OriConversationSummary } from "@/types/ori";

interface OriChatsPanelProps {
  conversations: OriConversationSummary[];
  loading: boolean;
  activeId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function itemDateLabel(updatedAt: string): string {
  const date = new Date(updatedAt);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

function groupLabel(updatedAt: string): string {
  const date = new Date(updatedAt);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (diffDays <= 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays <= 7) return "Últimos 7 días";
  if (diffDays <= 30) return "Últimos 30 días";
  return "Anteriores";
}

const GROUP_ORDER = ["Hoy", "Ayer", "Últimos 7 días", "Últimos 30 días", "Anteriores"];

/** Panel "Chats" — historial de conversaciones de Ori, al estilo Claude/Gemini/GPT, pero anclado a la derecha (ya que el menú principal de Noova ocupa la izquierda). Exclusivo de /dashboard/ori. */
export function OriChatsPanel({ conversations, loading, activeId, onSelect, onNewChat, onDelete, onClose }: OriChatsPanelProps) {
  const groups = new Map<string, OriConversationSummary[]>();
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  for (const c of sorted) {
    const label = groupLabel(c.updatedAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(c);
  }

  return (
    <aside className="relative z-10 shrink-0 w-[280px] h-full border-l border-[var(--nv-border)] bg-[var(--nv-bg-surface)] flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-4 border-b border-[var(--nv-border)]">
        <span className="text-[13px] font-semibold text-[var(--nv-text)] tracking-tight">Chats</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNewChat}
            title="Nuevo chat"
            className="p-1.5 rounded-lg text-[var(--nv-text-faint)] hover:text-[var(--nv-text)] hover:bg-[var(--nv-hover)] transition-colors"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar panel"
            className="p-1.5 rounded-lg text-[var(--nv-text-faint)] hover:text-[var(--nv-text)] hover:bg-[var(--nv-hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {loading && (
          <p className="px-2.5 py-3 text-xs text-[var(--nv-text-faint)]">Cargando…</p>
        )}

        {!loading && conversations.length === 0 && (
          <p className="px-2.5 py-3 text-xs text-[var(--nv-text-faint)] leading-relaxed">
            Todavía no tienes chats guardados. Empieza a escribirle a Ori y aparecerán aquí.
          </p>
        )}

        {GROUP_ORDER.filter(label => groups.has(label)).map(label => (
          <div key={label} className="mb-3">
            <p className="px-2.5 pb-1.5 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
              {label}
            </p>
            {groups.get(label)!.map(c => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                  c.id === activeId
                    ? "bg-[#0f7eff]/[.14] text-[var(--nv-text)]"
                    : "text-[var(--nv-text-muted)] hover:bg-[var(--nv-hover)] hover:text-[var(--nv-text)]"
                }`}
                onClick={() => onSelect(c.id)}
              >
                <span className="flex-1 min-w-0 truncate text-[13px]">{c.title}</span>
                <span className="shrink-0 text-[10.5px] text-[var(--nv-text-faint)] tabular-nums group-hover:opacity-0 transition-opacity">
                  {itemDateLabel(c.updatedAt)}
                </span>
                <button
                  type="button"
                  title="Eliminar chat"
                  onClick={e => {
                    e.stopPropagation();
                    onDelete(c.id);
                  }}
                  className="shrink-0 p-1 rounded-md text-[var(--nv-text-faint)] opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-[var(--nv-hover-strong)] transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
