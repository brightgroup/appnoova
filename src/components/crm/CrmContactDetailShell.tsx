"use client";

import Link from "next/link";
import { ChevronLeft, Loader2, Save, Trash2 } from "lucide-react";
import { btnGhost, btnPrimary, tabActive, tabIdle } from "@/lib/brand-ui";

export type CrmContactTabId = "perfil" | "actividad" | "ori";

export interface CrmContactTab {
  id: CrmContactTabId;
  label: string;
  icon: React.ElementType;
}

interface CrmContactDetailShellProps {
  backHref: string;
  title: string;
  subtitle?: string;
  tabs: CrmContactTab[];
  activeTab: CrmContactTabId;
  onTabChange: (tab: CrmContactTabId) => void;
  headerActions?: React.ReactNode;
  saving?: boolean;
  loading?: boolean;
  error?: string;
  onSave?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}

export function CrmContactDetailShell({
  backHref,
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  headerActions,
  saving,
  loading,
  error,
  onSave,
  onDelete,
  children
}: CrmContactDetailShellProps) {
  return (
    <div className="flex-1 flex flex-col bg-noova-main text-gray-100 min-h-0 overflow-hidden">
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={backHref}
            className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 hover:text-white shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{title}</h1>
            {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerActions}
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={loading || saving} className={btnGhost}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {onSave && (
            <button type="button" onClick={onSave} disabled={loading || saving} className={btnPrimary}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-white/[.08] px-6 flex gap-1 overflow-x-auto shrink-0">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive ? tabActive : tabIdle
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 shrink-0">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando contacto…
          </div>
        ) : (
          <div className="px-6 py-6 max-w-3xl">{children}</div>
        )}
      </div>
    </div>
  );
}
