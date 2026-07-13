"use client";

import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { NoovaLogo } from "@/components/brand/NoovaLogo";
import { DESKTOP_MEDIA_QUERY, DESKTOP_MIN_WIDTH_PX } from "@/lib/desktop-viewport";
import { getMarketingSiteUrl } from "@/lib/marketing-site-url";

function DesktopOnlyMessage({ neutralBranding }: { neutralBranding?: boolean }) {
  const marketingUrl = getMarketingSiteUrl();
  return (
    <div className="login-page-bg relative flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center">
      <div className="login-page-glow" aria-hidden />

      {!neutralBranding && (
        <a href={marketingUrl} className="relative z-10 mb-8">
          <NoovaLogo width={160} height={40} priority />
        </a>
      )}

      {neutralBranding && (
        <p className="relative z-10 mb-8 text-xl font-bold text-[var(--nv-text)]">Dashboard</p>
      )}

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-[var(--nv-border-strong)] bg-[var(--nv-bg-surface)] p-8 shadow-nv-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#5b5bf6]/15 border border-[#5b5bf6]/25">
          <Monitor className="h-6 w-6 text-[#a5a5ff]" />
        </div>
        <p className="text-sm text-[var(--nv-text-muted)] leading-relaxed">
          {neutralBranding
            ? `Este panel requiere una pantalla de escritorio (mínimo ${DESKTOP_MIN_WIDTH_PX}px de ancho). Accede desde tu PC o laptop.`
            : `Noova 360 requiere una pantalla de escritorio (mínimo ${DESKTOP_MIN_WIDTH_PX}px de ancho) para mostrar todos los módulos con claridad. Accede desde tu PC o laptop.`}
        </p>
        {!neutralBranding && (
          <a
            href={marketingUrl}
            className="mt-6 inline-flex text-xs font-semibold text-[var(--nv-accent-text)] hover:text-[#5b5bf6] transition-colors"
          >
            Volver al sitio
          </a>
        )}
      </div>
    </div>
  );
}

export function DesktopOnlyGate({
  children,
  neutralBranding = false,
}: {
  children: React.ReactNode;
  neutralBranding?: boolean;
}) {
  // Asumir escritorio en SSR para que el HTML inicial coincida con la hidratación.
  const [desktop, setDesktop] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const sync = () => setDesktop(mq.matches);
    sync();
    setChecked(true);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (checked && !desktop) {
    return <DesktopOnlyMessage neutralBranding={neutralBranding} />;
  }

  return <>{children}</>;
}
