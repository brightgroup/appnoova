"use client";

import Link from "next/link";
import { ChevronLeft, Loader2, Save, Trash2 } from "lucide-react";
import { btnGhost, btnPrimary } from "@/lib/brand-ui";

interface CrmDetailLayoutProps {
  backHref: string;
  title: string;
  subtitle?: string;
  saving?: boolean;
  saveLabel?: string;
  onSave?: () => void;
  onDelete?: () => void;
  loading?: boolean;
  error?: string;
  children: React.ReactNode;
}

export function CrmDetailLayout({
  backHref,
  title,
  subtitle,
  saving,
  saveLabel = "Guardar cambios",
  onSave,
  onDelete,
  loading,
  error,
  children
}: CrmDetailLayoutProps) {
  return (
    <div className="flex-1 flex flex-col bg-noova-main min-h-0 overflow-hidden">
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between shrink-0 gap-4">
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
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={loading || saving} className={btnGhost}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {onSave && (
            <button type="button" onClick={onSave} disabled={loading || saving} className={btnPrimary}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Guardando…" : saveLabel}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 max-w-2xl p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
          </div>
        ) : (
          <div className="max-w-2xl">{children}</div>
        )}
      </div>
    </div>
  );
}
