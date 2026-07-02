"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/telephony-api";
import {
  registryContent,
  registryPage,
  registryPanel,
  registryToolbar,
  textMuted,
} from "@/lib/brand-ui";

function displayName(meta: Record<string, unknown> | undefined, email: string | undefined): string {
  const fromMeta =
    (meta?.nombre as string | undefined) ||
    (meta?.full_name as string | undefined) ||
    (meta?.name as string | undefined);
  if (fromMeta?.trim()) return fromMeta.trim();
  if (email) return email.split("@")[0] ?? "Usuario";
  return "Usuario";
}

export default function PerfilPage() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("—");
  const [email, setEmail] = useState("—");
  const [orgName, setOrgName] = useState("—");
  const [initials, setInitials] = useState("?");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: { user } }, billingRes] = await Promise.all([
        supabase.auth.getUser(),
        authFetch("/api/billing/me"),
      ]);
      if (cancelled) return;

      const dn = displayName(user?.user_metadata, user?.email ?? undefined);
      setName(dn);
      setEmail(user?.email ?? "—");
      setInitials(
        dn
          .split(/\s+/)
          .slice(0, 2)
          .map(p => p[0]?.toUpperCase() ?? "")
          .join("") || "?"
      );

      if (billingRes.ok) {
        const json = await billingRes.json();
        setOrgName(json.organization?.name ?? json.subscription?.plans?.name ?? "—");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
            <h1 className="text-xl font-bold tracking-tight text-[var(--nv-text)]">Mi perfil</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>Datos de tu cuenta</p>
          </div>
        </div>
      </div>

      <div className={registryContent}>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[var(--nv-text-muted)]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Cargando perfil…
          </div>
        ) : (
          <div className={`${registryPanel} max-w-lg rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg-surface)] p-6`}>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0fe3ff] text-lg font-bold text-[#03289d]">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-[var(--nv-text)] truncate">{name}</p>
                <p className="text-sm text-[var(--nv-text-muted)] truncate">{email}</p>
              </div>
            </div>

            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
                  Nombre
                </dt>
                <dd className="mt-1 text-[var(--nv-text)]">{name}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
                  Correo
                </dt>
                <dd className="mt-1 text-[var(--nv-text)]">{email}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
                  Organización
                </dt>
                <dd className="mt-1 text-[var(--nv-text)]">{orgName}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
