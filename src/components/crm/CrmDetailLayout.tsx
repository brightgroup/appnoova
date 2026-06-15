"use client";

import Link from "next/link";
import { ChevronLeft, Loader2, Save, Trash2 } from "lucide-react";
import { btnGhost, btnPrimary, registryContent, registryPage, registryToolbar, textMuted } from "@/lib/brand-ui";

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
  wide?: boolean;
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
  wide,
  children
}: CrmDetailLayoutProps) {
  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={backHref}
              className="p-1.5 hover:bg-white/[.06] rounded-lg transition-colors text-gray-400 hover:text-white shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">{title}</h1>
              {subtitle && <p className={`text-xs ${textMuted} mt-0.5 truncate`}>{subtitle}</p>}
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
      </div>

      <div className={registryContent}>
        {error && (
          <div className="mb-4 max-w-3xl p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
          </div>
        ) : (
          <div className={wide ? "max-w-3xl" : "max-w-2xl"}>{children}</div>
        )}
      </div>
    </div>
  );
}
