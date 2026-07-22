"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ThemeSettingPanel } from "@/components/theme/ThemeSettingPanel";
import { BusinessHoursEditor } from "@/components/scheduling/BusinessHoursEditor";
import { registryContent, registryPage, registryPanel, registryToolbar, textMuted } from "@/lib/brand-ui";

export default function PlatformConfigPage() {
  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-1.5 rounded-lg text-[var(--nv-text-muted)] hover:bg-[var(--nv-hover-strong)] hover:text-[var(--nv-text)] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--nv-text)]">Configuración</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>Preferencias generales de la plataforma y del negocio</p>
          </div>
        </div>
      </div>

      <div className={registryContent}>
        <div className="max-w-3xl space-y-6">
          <div className={`${registryPanel} rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg-surface)] p-6`}>
            <BusinessHoursEditor />
          </div>

          <div className={`${registryPanel} rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg-surface)] p-6`}>
            <ThemeSettingPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
